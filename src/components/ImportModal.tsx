import { useState, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { CloseIcon, UploadIcon, KeyIcon, SparklesIcon, EyeIcon, EyeSlashIcon, CheckIcon } from './Icons';
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
  const [selectedFileName, setSelectedFileName] = useState<string>('');

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

  const processFile = useCallback(async (file: File) => {
    console.log('Processing file:', file.name, file.type, file.size);
    setSelectedFileName(file.name);
    setDebugInfo(`Processing: ${file.name}`);
    setError(null);
    setStep('parsing');

    try {
      // Read Excel file
      const buffer = await file.arrayBuffer();
      console.log('File buffer loaded, size:', buffer.byteLength);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      console.log('Workbook loaded, sheets:', workbook.worksheets.length);

      // Convert workbook to text representation
      let excelText = '';
      let rowCount = 0;

      workbook.eachSheet((sheet, sheetId) => {
        excelText += `\n=== Sheet ${sheetId}: ${sheet.name} ===\n`;
        sheet.eachRow((row, rowNum) => {
          rowCount++;
          const values = row.values as any[];
          // Skip first element (1-indexed array)
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

      console.log('Excel text extracted, rows:', rowCount, 'length:', excelText.length);
      setDebugInfo(`Extracted ${rowCount} rows, sending to AI...`);

      if (excelText.trim().length < 50) {
        throw new Error('Excel file appears to be empty or could not be read');
      }

      // Send to Claude API for parsing
      const parsedData = await parseWithClaude(excelText);

      if (parsedData) {
        console.log('Parsed data:', parsedData);
        setPreview(parsedData);
        // Select all workouts by default
        setSelectedWorkouts(new Set(parsedData.workouts.map((_, i) => i)));
        setStep('preview');
      }
    } catch (err: any) {
      console.error('Import error:', err);
      setError(err.message || 'Failed to parse Excel file');
      setStep('upload');
    }
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('File input change event');
    const file = e.target.files?.[0];
    if (!file) {
      console.log('No file selected');
      return;
    }
    await processFile(file);
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    console.log('File dropped');
    const file = e.dataTransfer.files[0];
    if (file) {
      await processFile(file);
    }
  }, [processFile]);

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
    console.log('Upload area clicked');
    fileInputRef.current?.click();
  };

  const parseWithClaude = async (excelText: string): Promise<ImportPreview | null> => {
    const storedKey = getStoredApiKey();
    if (!storedKey) {
      throw new Error('API key not configured');
    }

    const prompt = `Analyze this workout Excel data and extract all workout information. Return a JSON object with the following structure:

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

Rules:
1. Extract ALL workout data you can find
2. Identify categories (muscle groups like Chest, Back, Legs, Arms, Shoulders, Core, etc.)
3. Identify exercises (Bench Press, Squat, Deadlift, etc.)
4. For each workout entry, extract date, exercise, weight (in kg), and reps
5. If weight is in lbs, convert to kg (divide by 2.205)
6. If date format is unclear, use best guess in YYYY-MM-DD format
7. Group sets that were done on the same day for the same exercise
8. Be thorough - extract every single set you can find
9. If you can't determine the exact category, use a reasonable guess based on the exercise name

Excel Data:
${excelText.substring(0, 50000)}

IMPORTANT: Return ONLY the raw JSON object. Do NOT wrap it in markdown code blocks. Do NOT include any explanation or text before or after the JSON.`;

    console.log('Calling Claude API...');
    setDebugInfo('Calling Claude API...');

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
        max_tokens: 16384,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    console.log('API response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('API error:', errorData);

      // Extract the actual error message
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
    console.log('Full API response:', JSON.stringify(data, null, 2));

    const content = data.content?.[0]?.text;
    console.log('Content type:', typeof content);
    console.log('Content value:', content);

    if (!content) {
      console.error('No content in response. Full data:', data);
      throw new Error('No response from Claude API. Check console for details.');
    }

    console.log('Raw AI response content (first 1000 chars):', content.substring(0, 1000));

    // Try multiple approaches to extract JSON
    let jsonString = content;

    // Approach 1: Remove markdown code blocks (```json ... ```)
    // Handle both ```json and ``` formats
    if (content.includes('```')) {
      const startMarker = content.indexOf('```');
      let startContent = startMarker + 3;
      // Skip "json" if present
      if (content.substring(startContent, startContent + 4) === 'json') {
        startContent += 4;
      }
      // Skip newline
      while (content[startContent] === '\n' || content[startContent] === ' ') {
        startContent++;
      }
      const endMarker = content.lastIndexOf('```');
      if (endMarker > startMarker) {
        jsonString = content.substring(startContent, endMarker).trim();
        console.log('Extracted from code block:', jsonString.substring(0, 200));
      }
    }

    // Approach 2: Find JSON object using balanced braces
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

    // Handle truncated responses - try to repair the JSON
    let extractedJson: string;

    if (startIdx === -1) {
      console.error('Could not find opening brace in response');
      throw new Error('Could not find JSON in AI response. Please try again.');
    }

    if (endIdx === -1) {
      // Response was truncated - try to repair it
      console.warn('JSON appears to be truncated, attempting to repair...');
      extractedJson = jsonString.substring(startIdx);

      // Count open brackets and close them
      let openBraces = 0;
      let openBrackets = 0;
      let inString = false;
      let escaped = false;

      for (const char of extractedJson) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === '{') openBraces++;
          else if (char === '}') openBraces--;
          else if (char === '[') openBrackets++;
          else if (char === ']') openBrackets--;
        }
      }

      // Remove any incomplete trailing content (after last complete entry)
      // Find the last complete workout entry
      const lastCompleteWorkout = extractedJson.lastIndexOf('}]},');
      const lastCompleteEntry = extractedJson.lastIndexOf('}},');
      const cutPoint = Math.max(lastCompleteWorkout, lastCompleteEntry);

      if (cutPoint > 0) {
        extractedJson = extractedJson.substring(0, cutPoint + 3);
        // Close remaining brackets
        extractedJson += '], "totalSets": 0}';
      } else {
        // Just close all open brackets
        extractedJson = extractedJson.replace(/,\s*$/, ''); // Remove trailing comma
        extractedJson += ']'.repeat(openBrackets) + '}'.repeat(openBraces);
      }

      console.log('Repaired JSON (last 200 chars):', extractedJson.substring(extractedJson.length - 200));
    } else {
      extractedJson = jsonString.substring(startIdx, endIdx);
    }

    console.log('Extracted JSON length:', extractedJson.length);

    try {
      // Clean up the JSON string - remove any trailing commas before } or ]
      const cleanJson = extractedJson
        .replace(/,(\s*[}\]])/g, '$1')
        .replace(/}\s*,\s*]/g, '}]'); // Fix }}, to }]

      const parsed = JSON.parse(cleanJson);
      console.log('Parsed successfully:', {
        categories: parsed.categories?.length,
        exercises: parsed.exercises?.length,
        workouts: parsed.workouts?.length
      });

      return {
        categories: parsed.categories || [],
        exercises: parsed.exercises || [],
        workouts: parsed.workouts || [],
        totalSets: parsed.totalSets || parsed.workouts?.reduce((sum: number, w: ParsedWorkout) => sum + w.sets.length, 0) || 0,
      };
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr);
      console.error('Attempted to parse (last 500 chars):', extractedJson.substring(extractedJson.length - 500));
      throw new Error('Failed to parse AI response. Your file may have too much data. Try a smaller file or fewer rows.');
    }
  };

  const handleImport = async () => {
    if (!user || !preview) return;

    setStep('importing');
    const selectedWorkoutsList = preview.workouts.filter((_, i) => selectedWorkouts.has(i));
    const total = selectedWorkoutsList.reduce((sum, w) => sum + w.sets.length, 0);
    setImportProgress({ current: 0, total });

    try {
      // Create a map of existing categories and exercises
      const categoryMap = new Map<string, string>();
      const exerciseMap = new Map<string, string>();

      // Add existing ones
      categories.forEach(c => categoryMap.set(c.name.toLowerCase(), c.id));
      exercises.forEach(e => exerciseMap.set(`${e.name.toLowerCase()}_${e.category_id}`, e.id));

      // Create new categories
      for (const catName of preview.categories) {
        const key = catName.toLowerCase();
        if (!categoryMap.has(key)) {
          const newCat = await createCategory(user.id, catName, categories.length + categoryMap.size);
          categoryMap.set(key, newCat.id);
          addCategory(newCat);
        }
      }

      // Create new exercises
      for (const ex of preview.exercises) {
        const categoryId = categoryMap.get(ex.category.toLowerCase());
        if (!categoryId) continue;

        const key = `${ex.name.toLowerCase()}_${categoryId}`;
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
        // Create session for this date
        const session = {
          id: uuidv4(),
          user_id: user.id,
          date,
          created_at: new Date().toISOString(),
        };
        await upsertSession(session);

        // Create sets for each workout
        for (const workout of dayWorkouts) {
          const categoryId = categoryMap.get(workout.category.toLowerCase());
          if (!categoryId) continue;

          const exerciseId = exerciseMap.get(`${workout.exercise.toLowerCase()}_${categoryId}`);
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

      // Final sync
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
                  Your API key is used to analyze the Excel file. It's stored locally in your browser and never sent to our servers.
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
                className={`p-8 border-2 border-dashed rounded-xl text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-[#f97316] bg-[#f97316]/10'
                    : 'border-[#333] hover:border-[#f97316]'
                }`}
                onClick={handleClickUpload}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <UploadIcon className={`w-12 h-12 mx-auto mb-3 ${isDragging ? 'text-[#f97316]' : 'text-[#525252]'}`} />
                <p className="text-white font-medium">
                  {isDragging ? 'Drop your file here' : 'Click to upload or drag & drop'}
                </p>
                <p className="text-sm text-[#737373] mt-1">
                  .xlsx or .xls files supported
                </p>
                {selectedFileName && (
                  <p className="text-sm text-[#f97316] mt-2">
                    Last file: {selectedFileName}
                  </p>
                )}
              </div>

              {/* Hidden file input - MUST be outside the click target */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />

              <div className="p-4 bg-[#1a1a1a] rounded-xl space-y-2">
                <p className="text-sm font-medium text-white">How it works:</p>
                <ol className="text-sm text-[#737373] space-y-1 list-decimal list-inside">
                  <li>Upload any Excel file with workout data</li>
                  <li>AI analyzes the format automatically</li>
                  <li>Review detected workouts</li>
                  <li>Import selected entries</li>
                </ol>
              </div>

              <button onClick={() => setStep('config')} className="btn-secondary w-full">
                Change API Key
              </button>
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
              {/* Summary */}
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

              {/* Selection controls */}
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

              {/* Workout list */}
              <div className="max-h-60 overflow-y-auto space-y-2">
                {preview.workouts.length === 0 ? (
                  <div className="p-4 text-center text-[#737373]">
                    No workouts detected in the file
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
                <button onClick={() => setStep('upload')} className="btn-secondary flex-1">
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
