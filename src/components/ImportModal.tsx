import { useState, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { CloseIcon, UploadIcon, KeyIcon, SparklesIcon, EyeIcon, EyeSlashIcon, CheckIcon, TrashIcon, PlusIcon } from './Icons';
import ExcelJS from 'exceljs';
import { v4 as uuidv4 } from 'uuid';
import { createCategory, createExercise, upsertSession, createSet, syncToServer } from '../lib/sync';

interface ImportModalProps {
  onClose: () => void;
}

interface ParsedWorkout {
  date: string;
  category: string;
  exercise: string;
  sets: Array<{
    weight: number;
    reps: number;
  }>;
}

interface ImportPreview {
  categories: string[];
  exercises: { name: string; category: string }[];
  workouts: ParsedWorkout[];
  totalSets: number;
}

interface UploadedFile {
  id: string;
  name: string;
  type: 'excel' | 'image';
  data: string; // base64 for images, text for excel
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
}

// API key storage
const API_KEY_STORAGE = 'workout_log_anthropic_api_key';

function getStoredApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) || '';
}

function setStoredApiKey(key: string): void {
  if (key) {
    localStorage.setItem(API_KEY_STORAGE, key);
  } else {
    localStorage.removeItem(API_KEY_STORAGE);
  }
}

export function ImportModal({ onClose }: ImportModalProps) {
  const { user, categories, exercises, addCategory, addExercise } = useStore();

  // If API key is already stored, start at upload step
  const storedKey = getStoredApiKey();
  const [step, setStep] = useState<'config' | 'upload' | 'parsing' | 'preview' | 'importing' | 'done'>(
    storedKey ? 'upload' : 'config'
  );
  const [apiKey, setApiKey] = useState(storedKey);
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [selectedWorkouts, setSelectedWorkouts] = useState<Set<number>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveApiKey = () => {
    if (!apiKey.trim()) {
      setError('Please enter an API key');
      return;
    }
    if (!apiKey.startsWith('sk-ant-')) {
      setError('Invalid API key format. It should start with "sk-ant-"');
      return;
    }
    setStoredApiKey(apiKey);
    setError(null);
    setStep('upload');
  };

  const processExcelFile = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    let excelText = '';
    workbook.eachSheet((sheet, sheetId) => {
      excelText += `\n=== Sheet ${sheetId}: ${sheet.name} ===\n`;
      sheet.eachRow((row, rowNum) => {
        const values = row.values as any[];
        const rowData = values.slice(1).map(v => {
          if (v === null || v === undefined) return '';
          if (typeof v === 'object' && v.text) return v.text;
          if (typeof v === 'object' && v.result !== undefined) return v.result;
          if (typeof v === 'object' && v.richText) {
            return v.richText.map((r: any) => r.text).join('');
          }
          return String(v);
        });
        excelText += `Row ${rowNum}: ${rowData.join(' | ')}\n`;
      });
    });

    return excelText;
  };

  const processImageFile = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        // Extract just the base64 data part (after the comma)
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
  };

  const addFile = useCallback(async (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv');

    if (!isImage && !isExcel) {
      setError('Please upload Excel files (.xlsx, .xls, .csv) or images (.png, .jpg, .jpeg)');
      return;
    }

    const newFile: UploadedFile = {
      id: uuidv4(),
      name: file.name,
      type: isImage ? 'image' : 'excel',
      data: '',
      status: 'pending',
    };

    setUploadedFiles(prev => [...prev, newFile]);

    try {
      let data: string;
      if (isImage) {
        data = await processImageFile(file);
      } else {
        data = await processExcelFile(file);
      }

      setUploadedFiles(prev =>
        prev.map(f => f.id === newFile.id ? { ...f, data, status: 'done' } : f)
      );
    } catch (err: any) {
      setUploadedFiles(prev =>
        prev.map(f => f.id === newFile.id ? { ...f, status: 'error', error: err.message } : f)
      );
    }
  }, []);

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      await addFile(files[i]);
    }
    e.target.value = '';
  };

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      await addFile(files[i]);
    }
  }, [addFile]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleClickUpload = () => {
    fileInputRef.current?.click();
  };

  const processAllFiles = async () => {
    const readyFiles = uploadedFiles.filter(f => f.status === 'done');
    if (readyFiles.length === 0) {
      setError('Please upload at least one file');
      return;
    }

    setStep('parsing');
    setDebugInfo(`Processing ${readyFiles.length} file(s)...`);

    try {
      const allPreviews: ImportPreview[] = [];

      for (let i = 0; i < readyFiles.length; i++) {
        const file = readyFiles[i];
        setDebugInfo(`Analyzing file ${i + 1}/${readyFiles.length}: ${file.name}`);

        const preview = await parseWithClaude(file);
        if (preview) {
          allPreviews.push(preview);
        }
      }

      // Merge all previews
      const mergedPreview = mergePreviewData(allPreviews);
      setPreview(mergedPreview);
      setSelectedWorkouts(new Set(mergedPreview.workouts.map((_, i) => i)));
      setStep('preview');
    } catch (err: any) {
      console.error('Import error:', err);
      setError(err.message || 'Failed to parse files');
      setStep('upload');
    }
  };

  const mergePreviewData = (previews: ImportPreview[]): ImportPreview => {
    const categories = new Set<string>();
    const exerciseMap = new Map<string, { name: string; category: string }>();
    const workouts: ParsedWorkout[] = [];

    for (const preview of previews) {
      // Add categories (exact match)
      preview.categories.forEach(c => categories.add(c));

      // Add exercises (use exact name as key)
      preview.exercises.forEach(e => {
        const key = `${e.name}__${e.category}`;
        if (!exerciseMap.has(key)) {
          exerciseMap.set(key, e);
        }
      });

      // Add workouts
      workouts.push(...preview.workouts);
    }

    return {
      categories: Array.from(categories),
      exercises: Array.from(exerciseMap.values()),
      workouts,
      totalSets: workouts.reduce((sum, w) => sum + w.sets.length, 0),
    };
  };

  const parseWithClaude = async (file: UploadedFile): Promise<ImportPreview | null> => {
    const storedKey = getStoredApiKey();
    if (!storedKey) {
      throw new Error('API key not configured');
    }

    const prompt = `Analyze this workout data and extract all workout information. Return a JSON object with the following structure:

{
  "categories": ["Category1", "Category2"],
  "exercises": [{"name": "Exercise1", "category": "Category1"}],
  "workouts": [
    {
      "date": "YYYY-MM-DD",
      "category": "Category name",
      "exercise": "Exercise name",
      "sets": [{"weight": 50, "reps": 10}, {"weight": 55, "reps": 8}]
    }
  ],
  "totalSets": 42
}

CRITICAL RULES - YOU MUST FOLLOW THESE EXACTLY:
1. **PRESERVE EXACT NAMES**: Use the EXACT spelling and capitalization of category and exercise names as written in the data. DO NOT rephrase, correct spelling, or change names in any way.
   - If user wrote "Bech press" → use "Bech press" (NOT "Bench Press")
   - If user wrote "CHEST" → use "CHEST" (NOT "Chest")
   - If user wrote "legz" → use "legz" (NOT "Legs")
2. Extract ALL workout data you can find
3. For categories, use EXACTLY what is written. If no category is specified, use "Uncategorized"
4. For exercises, use EXACTLY the name as written by the user
5. For each workout entry, extract date, exercise, weight (in kg), and reps
6. If weight is in lbs, convert to kg (divide by 2.205) but keep the exercise name EXACTLY as written
7. If date format is unclear, use best guess in YYYY-MM-DD format
8. Group sets that were done on the same day for the same exercise
9. Be thorough - extract every single set you can find

REMEMBER: The user's original spelling and naming MUST be preserved exactly. Never correct or modify names.

IMPORTANT: Return ONLY the raw JSON object. Do NOT wrap it in markdown code blocks. Do NOT include any explanation or text before or after the JSON.`;

    let messages: any[];

    if (file.type === 'image') {
      // For images, use vision capability
      messages = [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: file.data,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ];
    } else {
      // For Excel, send as text
      messages = [
        {
          role: 'user',
          content: `${prompt}\n\nExcel Data:\n${file.data.substring(0, 400000)}`,
        },
      ];
    }

    console.log('Calling Claude API for file:', file.name);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': storedKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 64000,
        messages,
      }),
    });

    console.log('API response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('API error:', errorData);

      const errorMessage = errorData?.error?.message
        || (typeof errorData === 'string' ? errorData : JSON.stringify(errorData));

      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your Anthropic API key.');
      }
      if (response.status === 403) {
        throw new Error('API access forbidden. Make sure your API key has the correct permissions.');
      }
      if (response.status === 404) {
        throw new Error('API model not found. Please try again or contact support.');
      }
      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment and try again.');
      }
      throw new Error(`API Error (${response.status}): ${errorMessage}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      console.error('No content in response. Full data:', data);
      throw new Error('No response from Claude API. Check console for details.');
    }

    // Extract JSON from response
    let jsonString = content;

    if (content.includes('```')) {
      const startMarker = content.indexOf('```');
      let startContent = startMarker + 3;
      if (content.substring(startContent, startContent + 4) === 'json') {
        startContent += 4;
      }
      while (content[startContent] === '\n' || content[startContent] === ' ') {
        startContent++;
      }
      const endMarker = content.lastIndexOf('```');
      if (endMarker > startMarker) {
        jsonString = content.substring(startContent, endMarker).trim();
      }
    }

    // Find JSON object
    let braceCount = 0;
    let startIdx = -1;
    let endIdx = -1;

    for (let i = 0; i < jsonString.length; i++) {
      if (jsonString[i] === '{') {
        if (startIdx === -1) startIdx = i;
        braceCount++;
      } else if (jsonString[i] === '}') {
        braceCount--;
        if (braceCount === 0 && startIdx !== -1) {
          endIdx = i + 1;
          break;
        }
      }
    }

    let extractedJson: string;

    if (startIdx === -1) {
      throw new Error('Could not find JSON in AI response. Please try again.');
    }

    if (endIdx === -1) {
      // Truncated response - try to repair
      extractedJson = jsonString.substring(startIdx);
      let openBraces = 0;
      let openBrackets = 0;
      let inString = false;
      let escaped = false;

      for (const char of extractedJson) {
        if (escaped) { escaped = false; continue; }
        if (char === '\\') { escaped = true; continue; }
        if (char === '"') { inString = !inString; continue; }
        if (!inString) {
          if (char === '{') openBraces++;
          else if (char === '}') openBraces--;
          else if (char === '[') openBrackets++;
          else if (char === ']') openBrackets--;
        }
      }

      const lastCompleteWorkout = extractedJson.lastIndexOf('}]},');
      const lastCompleteEntry = extractedJson.lastIndexOf('}},');
      const cutPoint = Math.max(lastCompleteWorkout, lastCompleteEntry);

      if (cutPoint > 0) {
        extractedJson = extractedJson.substring(0, cutPoint + 3);
        extractedJson += '], "totalSets": 0}';
      } else {
        extractedJson = extractedJson.replace(/,\s*$/, '');
        extractedJson += ']'.repeat(openBrackets) + '}'.repeat(openBraces);
      }
    } else {
      extractedJson = jsonString.substring(startIdx, endIdx);
    }

    try {
      const cleanJson = extractedJson
        .replace(/,(\s*[}\]])/g, '$1')
        .replace(/}\s*,\s*]/g, '}]');

      const parsed = JSON.parse(cleanJson);

      return {
        categories: parsed.categories || [],
        exercises: parsed.exercises || [],
        workouts: parsed.workouts || [],
        totalSets: parsed.totalSets || parsed.workouts?.reduce((sum: number, w: ParsedWorkout) => sum + w.sets.length, 0) || 0,
      };
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr);
      throw new Error(`Failed to parse data from ${file.name}. Try a smaller file.`);
    }
  };

  const handleImport = async () => {
    if (!user || !preview) return;

    setStep('importing');
    const selectedWorkoutsList = preview.workouts.filter((_, i) => selectedWorkouts.has(i));
    const total = selectedWorkoutsList.reduce((sum, w) => sum + w.sets.length, 0);
    setImportProgress({ current: 0, total });

    try {
      // Create maps using EXACT names (case-sensitive for matching)
      const categoryMap = new Map<string, string>();
      const exerciseMap = new Map<string, string>();

      // Add existing categories and exercises (exact match)
      categories.forEach(c => categoryMap.set(c.name, c.id));
      exercises.forEach(e => exerciseMap.set(`${e.name}__${e.category_id}`, e.id));

      // Create new categories (preserving exact names)
      for (const catName of preview.categories) {
        if (!categoryMap.has(catName)) {
          const newCat = await createCategory(user.id, catName, categories.length + categoryMap.size);
          categoryMap.set(catName, newCat.id);
          addCategory(newCat);
        }
      }

      // Create new exercises (preserving exact names)
      for (const ex of preview.exercises) {
        const categoryId = categoryMap.get(ex.category);
        if (!categoryId) continue;

        const key = `${ex.name}__${categoryId}`;
        if (!exerciseMap.has(key)) {
          const catExercises = exercises.filter(e => e.category_id === categoryId);
          const newEx = await createExercise(user.id, categoryId, ex.name, catExercises.length + 1);
          exerciseMap.set(key, newEx.id);
          addExercise(newEx);
        }
      }

      // Group workouts by date
      const workoutsByDate = new Map<string, ParsedWorkout[]>();
      selectedWorkoutsList.forEach(w => {
        const existing = workoutsByDate.get(w.date) || [];
        existing.push(w);
        workoutsByDate.set(w.date, existing);
      });

      let current = 0;

      // Create sessions and sets
      for (const [date, dayWorkouts] of workoutsByDate) {
        const session = {
          id: uuidv4(),
          user_id: user.id,
          date,
          created_at: new Date().toISOString(),
        };
        await upsertSession(session);

        for (const workout of dayWorkouts) {
          const categoryId = categoryMap.get(workout.category);
          if (!categoryId) continue;

          const exerciseId = exerciseMap.get(`${workout.exercise}__${categoryId}`);
          if (!exerciseId) continue;

          for (let i = 0; i < workout.sets.length; i++) {
            const set = workout.sets[i];
            await createSet(
              user.id,
              session.id,
              exerciseId,
              i + 1,
              set.weight,
              set.reps
            );
            current++;
            setImportProgress({ current, total });
          }
        }
      }

      await syncToServer();
      setStep('done');
    } catch (err: any) {
      console.error('Import error:', err);
      setError(err.message || 'Failed to import data');
      setStep('preview');
    }
  };

  const toggleWorkout = (index: number) => {
    const newSelected = new Set(selectedWorkouts);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedWorkouts(newSelected);
  };

  const selectAll = () => {
    if (preview) {
      setSelectedWorkouts(new Set(preview.workouts.map((_, i) => i)));
    }
  };

  const deselectAll = () => {
    setSelectedWorkouts(new Set());
  };

  const readyFilesCount = uploadedFiles.filter(f => f.status === 'done').length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1a1a1a]">
          <div className="flex items-center gap-3">
            <SparklesIcon className="w-6 h-6 text-[#f97316]" />
            <h2 className="text-lg font-semibold text-white">Import Workout History</h2>
          </div>
          <button onClick={onClose} className="btn-icon">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-[#ef4444]/10 border border-[#ef4444]/20 rounded-xl text-[#ef4444] text-sm">
              {error}
            </div>
          )}

          {/* Step 1: API Key Configuration */}
          {step === 'config' && (
            <div className="space-y-4">
              <div className="p-4 bg-[#1a1a1a] rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-[#f97316]">
                  <KeyIcon className="w-5 h-5" />
                  <span className="font-medium">Anthropic API Key</span>
                </div>
                <p className="text-sm text-[#737373]">
                  Your API key is used to analyze files. It's stored locally and never sent to our servers.
                </p>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className="input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#737373] hover:text-white"
                  >
                    {showApiKey ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-[#525252]">
                  Get your API key from{' '}
                  <a
                    href="https://console.anthropic.com/settings/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#f97316] hover:underline"
                  >
                    console.anthropic.com
                  </a>
                </p>
              </div>

              <button onClick={handleSaveApiKey} className="btn-primary w-full">
                Continue
              </button>
            </div>
          )}

          {/* Step 2: File Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                className={`p-6 border-2 border-dashed rounded-xl text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-[#f97316] bg-[#f97316]/10'
                    : 'border-[#333] hover:border-[#f97316]'
                }`}
                onClick={handleClickUpload}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <UploadIcon className={`w-10 h-10 mx-auto mb-2 ${isDragging ? 'text-[#f97316]' : 'text-[#525252]'}`} />
                <p className="text-white font-medium">
                  {isDragging ? 'Drop files here' : 'Click to upload or drag & drop'}
                </p>
                <p className="text-sm text-[#737373] mt-1">
                  Excel (.xlsx, .xls) or Images (.png, .jpg)
                </p>
                <p className="text-xs text-[#525252] mt-1">
                  Upload multiple files to combine data
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Uploaded Files List */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">
                      Files ({uploadedFiles.length})
                    </span>
                    <button
                      onClick={handleClickUpload}
                      className="text-sm text-[#f97316] hover:underline flex items-center gap-1"
                    >
                      <PlusIcon className="w-4 h-4" />
                      Add more
                    </button>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {uploadedFiles.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-3 bg-[#1a1a1a] rounded-xl"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-2 h-2 rounded-full ${
                            file.status === 'done' ? 'bg-[#22c55e]' :
                            file.status === 'error' ? 'bg-[#ef4444]' :
                            file.status === 'processing' ? 'bg-[#f97316] animate-pulse' :
                            'bg-[#525252]'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white truncate">{file.name}</p>
                            <p className="text-xs text-[#525252]">
                              {file.type === 'image' ? 'Image' : 'Excel'}
                              {file.error && <span className="text-[#ef4444] ml-2">{file.error}</span>}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => removeFile(file.id)}
                          className="btn-icon text-[#ef4444] hover:bg-[#ef4444]/10"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-4 bg-[#1a1a1a] rounded-xl space-y-2">
                <p className="text-sm font-medium text-white">How it works:</p>
                <ol className="text-sm text-[#737373] space-y-1 list-decimal list-inside">
                  <li>Upload Excel files or images of workout logs</li>
                  <li>AI analyzes each file separately</li>
                  <li>Data is combined and deduplicated</li>
                  <li>Review and import selected entries</li>
                </ol>
                <p className="text-xs text-[#525252] mt-2">
                  Names are preserved exactly as you wrote them
                </p>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep('config')} className="btn-secondary flex-1">
                  Change API Key
                </button>
                <button
                  onClick={processAllFiles}
                  disabled={readyFilesCount === 0}
                  className="btn-primary flex-1"
                >
                  Process {readyFilesCount} file{readyFilesCount !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Parsing */}
          {step === 'parsing' && (
            <div className="py-12 text-center">
              <div className="w-16 h-16 border-4 border-[#f97316] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white font-medium">Analyzing your workout data...</p>
              <p className="text-sm text-[#737373] mt-1">This may take a moment</p>
              {debugInfo && (
                <p className="text-xs text-[#525252] mt-3">{debugInfo}</p>
              )}
            </div>
          )}

          {/* Step 4: Preview */}
          {step === 'preview' && preview && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-[#1a1a1a] rounded-xl text-center">
                  <div className="text-2xl font-bold text-[#f97316] number">{preview.categories.length}</div>
                  <div className="text-xs text-[#737373]">Categories</div>
                </div>
                <div className="p-3 bg-[#1a1a1a] rounded-xl text-center">
                  <div className="text-2xl font-bold text-[#f97316] number">{preview.exercises.length}</div>
                  <div className="text-xs text-[#737373]">Exercises</div>
                </div>
                <div className="p-3 bg-[#1a1a1a] rounded-xl text-center">
                  <div className="text-2xl font-bold text-[#f97316] number">{preview.totalSets}</div>
                  <div className="text-xs text-[#737373]">Total Sets</div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-[#737373]">
                  {selectedWorkouts.size} of {preview.workouts.length} entries selected
                </span>
                <div className="flex gap-2">
                  <button onClick={selectAll} className="text-sm text-[#f97316] hover:underline">
                    Select all
                  </button>
                  <span className="text-[#525252]">|</span>
                  <button onClick={deselectAll} className="text-sm text-[#737373] hover:underline">
                    Deselect all
                  </button>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2">
                {preview.workouts.length === 0 ? (
                  <div className="p-4 text-center text-[#737373]">
                    No workouts detected in the files
                  </div>
                ) : (
                  preview.workouts.map((workout, index) => (
                    <div
                      key={index}
                      onClick={() => toggleWorkout(index)}
                      className={`p-3 rounded-xl cursor-pointer transition-colors ${
                        selectedWorkouts.has(index)
                          ? 'bg-[#f97316]/10 border border-[#f97316]/30'
                          : 'bg-[#1a1a1a] border border-transparent'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                              selectedWorkouts.has(index)
                                ? 'bg-[#f97316] border-[#f97316]'
                                : 'border-[#525252]'
                            }`}
                          >
                            {selectedWorkouts.has(index) && <CheckIcon className="w-3 h-3 text-white" />}
                          </div>
                          <div>
                            <div className="text-white font-medium">{workout.exercise}</div>
                            <div className="text-xs text-[#737373]">
                              {workout.category} · {workout.date}
                            </div>
                          </div>
                        </div>
                        <div className="text-sm text-[#f97316] number">
                          {workout.sets.length} sets
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={() => { setStep('upload'); setPreview(null); }} className="btn-secondary flex-1">
                  Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={selectedWorkouts.size === 0}
                  className="btn-primary flex-1"
                >
                  Import {selectedWorkouts.size} entries
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Importing */}
          {step === 'importing' && (
            <div className="py-12 text-center">
              <div className="w-16 h-16 border-4 border-[#f97316] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white font-medium">Importing your workouts...</p>
              <p className="text-sm text-[#737373] mt-1">
                {importProgress.current} of {importProgress.total} sets
              </p>
              <div className="w-full bg-[#1a1a1a] rounded-full h-2 mt-4">
                <div
                  className="bg-[#f97316] h-2 rounded-full transition-all"
                  style={{ width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Step 6: Done */}
          {step === 'done' && (
            <div className="py-12 text-center">
              <div className="w-16 h-16 bg-[#22c55e]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckIcon className="w-8 h-8 text-[#22c55e]" />
              </div>
              <p className="text-white font-medium text-lg">Import Complete!</p>
              <p className="text-sm text-[#737373] mt-1">
                Successfully imported {importProgress.total} sets
              </p>
              <button onClick={onClose} className="btn-primary w-full mt-6">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
