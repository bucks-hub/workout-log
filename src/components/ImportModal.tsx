import { useState, useRef, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { CloseIcon, UploadIcon, DownloadIcon, KeyIcon, SparklesIcon, EyeIcon, EyeSlashIcon, CheckIcon, TrashIcon, PlusIcon, TableCellsIcon } from './Icons';
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
  rawData?: any[][]; // For manual import - parsed rows
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
}

// Column mapping for manual import
interface ColumnMapping {
  date: number | null;
  category: number | null;
  exercise: number | null;
  weight: number | null;
  reps: number | null;
  sets: number | null;
}

// Common header patterns for auto-detection
const HEADER_PATTERNS: Record<keyof ColumnMapping, string[]> = {
  date: ['date', 'workout date', 'day', 'when', 'timestamp'],
  category: ['category', 'muscle', 'muscle group', 'group', 'body part', 'type'],
  exercise: ['exercise', 'movement', 'workout', 'name', 'exercise name', 'lift'],
  weight: ['weight', 'kg', 'lbs', 'load', 'resistance', 'weight (kg)', 'weight (lbs)'],
  reps: ['reps', 'repetitions', 'rep', 'count', 'times'],
  sets: ['sets', 'set', 'set count', 'num sets'],
};

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

  // Start at mode selection
  const [step, setStep] = useState<'mode' | 'config' | 'upload' | 'mapping' | 'parsing' | 'preview' | 'importing' | 'done'>('mode');
  const [importMode, setImportMode] = useState<'manual' | 'ai' | null>(null);

  // API key for AI mode
  const storedKey = getStoredApiKey();
  const [apiKey, setApiKey] = useState(storedKey);
  const [showApiKey, setShowApiKey] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [selectedWorkouts, setSelectedWorkouts] = useState<Set<number>>(new Set());
  const [isDragging, setIsDragging] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  // Manual import state
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    date: null,
    category: null,
    exercise: null,
    weight: null,
    reps: null,
    sets: null,
  });
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<any[][]>([]);
  const [allRows, setAllRows] = useState<any[][]>([]);
  const [defaultCategory, setDefaultCategory] = useState('Uncategorized');

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

  const handleSelectMode = (mode: 'manual' | 'ai') => {
    setImportMode(mode);
    setError(null);
    if (mode === 'manual') {
      setStep('upload');
    } else {
      // AI mode - check for API key
      if (storedKey) {
        setStep('upload');
      } else {
        setStep('config');
      }
    }
  };

  const downloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Workouts');

    // Add headers
    sheet.addRow(['Date', 'Category', 'Exercise', 'Weight', 'Reps', 'Sets']);

    // Add sample data
    sheet.addRow(['2024-01-15', 'Chest', 'Bench Press', 60, 10, 3]);
    sheet.addRow(['2024-01-15', 'Chest', 'Incline Dumbbell Press', 20, 12, 3]);
    sheet.addRow(['2024-01-15', 'Back', 'Lat Pulldown', 45, 10, 3]);
    sheet.addRow(['2024-01-17', 'Legs', 'Squat', 80, 8, 4]);
    sheet.addRow(['2024-01-17', 'Legs', 'Leg Press', 120, 12, 3]);

    // Style headers
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF97316' },
    };
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    });

    // Set column widths
    sheet.getColumn(1).width = 12;
    sheet.getColumn(2).width = 15;
    sheet.getColumn(3).width = 25;
    sheet.getColumn(4).width = 10;
    sheet.getColumn(5).width = 8;
    sheet.getColumn(6).width = 8;

    // Generate and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'workout-import-template.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleManualPreview = () => {
    if (!columnMapping.exercise) {
      setError('Please map at least the Exercise column');
      return;
    }
    setError(null);
    const parsedPreview = parseRowsToWorkouts(allRows, columnMapping, defaultCategory);
    setPreview(parsedPreview);
    setSelectedWorkouts(new Set(parsedPreview.workouts.map((_, i) => i)));
    setStep('preview');
  };

  const processExcelFile = async (file: File): Promise<{ text: string; rows: any[][] }> => {
    const buffer = await file.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    let excelText = '';
    const rows: any[][] = [];

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
        rows.push(rowData);
      });
    });

    return { text: excelText, rows };
  };

  // Auto-detect column mapping from headers
  const autoDetectColumns = (headerRow: string[]): ColumnMapping => {
    const mapping: ColumnMapping = {
      date: null,
      category: null,
      exercise: null,
      weight: null,
      reps: null,
      sets: null,
    };

    headerRow.forEach((header, index) => {
      const normalized = header.toLowerCase().trim();
      for (const [key, patterns] of Object.entries(HEADER_PATTERNS)) {
        if (patterns.some(p => normalized.includes(p) || p.includes(normalized))) {
          if (mapping[key as keyof ColumnMapping] === null) {
            mapping[key as keyof ColumnMapping] = index;
          }
        }
      }
    });

    return mapping;
  };

  // Parse date from various formats
  const parseDate = (value: any): string => {
    if (!value) return new Date().toISOString().split('T')[0];

    // Already in YYYY-MM-DD format
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    // Excel date serial number
    if (typeof value === 'number') {
      const date = new Date((value - 25569) * 86400 * 1000);
      return date.toISOString().split('T')[0];
    }

    // Try parsing various date formats
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch {
      // Fall through
    }

    // DD/MM/YYYY or MM/DD/YYYY
    const parts = String(value).split(/[\/\-\.]/);
    if (parts.length === 3) {
      const [p1, p2, p3] = parts.map(p => parseInt(p, 10));
      // Assume DD/MM/YYYY if first part <= 31 and second <= 12
      if (p1 <= 31 && p2 <= 12) {
        const year = p3 < 100 ? 2000 + p3 : p3;
        return `${year}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
      }
      // MM/DD/YYYY
      if (p1 <= 12 && p2 <= 31) {
        const year = p3 < 100 ? 2000 + p3 : p3;
        return `${year}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
      }
    }

    return new Date().toISOString().split('T')[0];
  };

  // Parse rows into workouts using column mapping
  const parseRowsToWorkouts = (rows: any[][], mapping: ColumnMapping, defaultCat: string): ImportPreview => {
    const categoriesSet = new Set<string>();
    const exercisesMap = new Map<string, { name: string; category: string }>();
    const workoutsMap = new Map<string, ParsedWorkout>();

    // Skip header row
    const dataRows = rows.slice(1);

    for (const row of dataRows) {
      const date = mapping.date !== null ? parseDate(row[mapping.date]) : new Date().toISOString().split('T')[0];
      const category = mapping.category !== null ? String(row[mapping.category] || defaultCat).trim() : defaultCat;
      const exercise = mapping.exercise !== null ? String(row[mapping.exercise] || '').trim() : '';
      const weight = mapping.weight !== null ? parseFloat(row[mapping.weight]) || 0 : 0;
      const reps = mapping.reps !== null ? parseInt(row[mapping.reps], 10) || 0 : 0;
      const setsCount = mapping.sets !== null ? parseInt(row[mapping.sets], 10) || 1 : 1;

      if (!exercise) continue;

      categoriesSet.add(category);
      const exerciseKey = `${exercise}__${category}`;
      if (!exercisesMap.has(exerciseKey)) {
        exercisesMap.set(exerciseKey, { name: exercise, category });
      }

      const workoutKey = `${date}__${exercise}__${category}`;
      if (!workoutsMap.has(workoutKey)) {
        workoutsMap.set(workoutKey, {
          date,
          category,
          exercise,
          sets: [],
        });
      }

      const workout = workoutsMap.get(workoutKey)!;
      // Add sets based on setsCount
      for (let i = 0; i < setsCount; i++) {
        workout.sets.push({ weight, reps });
      }
    }

    const workouts = Array.from(workoutsMap.values());
    return {
      categories: Array.from(categoriesSet),
      exercises: Array.from(exercisesMap.values()),
      workouts,
      totalSets: workouts.reduce((sum, w) => sum + w.sets.length, 0),
    };
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

    // For manual mode, only accept Excel files
    if (importMode === 'manual' && isImage) {
      setError('Manual import only supports Excel/CSV files. Use AI import for images.');
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
      if (isImage) {
        const data = await processImageFile(file);
        setUploadedFiles(prev =>
          prev.map(f => f.id === newFile.id ? { ...f, data, status: 'done' } : f)
        );
      } else {
        const { text, rows } = await processExcelFile(file);
        setUploadedFiles(prev =>
          prev.map(f => f.id === newFile.id ? { ...f, data: text, rawData: rows, status: 'done' } : f)
        );

        // For manual mode, set up column mapping
        if (importMode === 'manual' && rows.length > 0) {
          const headerRow = rows[0].map(v => String(v));
          setHeaders(headerRow);
          setPreviewRows(rows.slice(1, 6)); // Show first 5 data rows
          setAllRows(rows);
          const detected = autoDetectColumns(headerRow);
          setColumnMapping(detected);
          setStep('mapping');
        }
      }
    } catch (err: any) {
      setUploadedFiles(prev =>
        prev.map(f => f.id === newFile.id ? { ...f, status: 'error', error: err.message } : f)
      );
    }
  }, [importMode]);

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

          {/* Step 0: Mode Selection */}
          {step === 'mode' && (
            <div className="space-y-4">
              <p className="text-[#a3a3a3] text-sm">
                Choose how you want to import your workout data:
              </p>

              <button
                onClick={() => handleSelectMode('manual')}
                className="w-full p-4 bg-[#1a1a1a] rounded-xl border border-[#333] hover:border-[#f97316] transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#22c55e]/10 rounded-lg flex items-center justify-center">
                    <TableCellsIcon className="w-6 h-6 text-[#22c55e]" />
                  </div>
                  <div>
                    <div className="font-medium text-white">Excel/CSV Import</div>
                    <div className="text-sm text-[#737373]">Free - No API key required</div>
                  </div>
                  <div className="ml-auto">
                    <span className="bg-[#22c55e]/10 text-[#22c55e] text-xs font-semibold px-2 py-1 rounded-full">
                      FREE
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="text-xs bg-[#262626] text-[#737373] px-2 py-0.5 rounded">.xlsx</span>
                  <span className="text-xs bg-[#262626] text-[#737373] px-2 py-0.5 rounded">.xls</span>
                  <span className="text-xs bg-[#262626] text-[#737373] px-2 py-0.5 rounded">.csv</span>
                </div>
                <p className="text-xs text-[#525252] mt-1">
                  Map columns manually with template guide
                </p>
              </button>

              <button
                onClick={() => handleSelectMode('ai')}
                className="w-full p-4 bg-[#1a1a1a] rounded-xl border border-[#333] hover:border-[#f97316] transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#f97316]/10 rounded-lg flex items-center justify-center">
                    <SparklesIcon className="w-6 h-6 text-[#f97316]" />
                  </div>
                  <div>
                    <div className="font-medium text-white">AI-Powered Import</div>
                    <div className="text-sm text-[#737373]">Requires Anthropic API key</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <span className="text-xs bg-[#262626] text-[#737373] px-2 py-0.5 rounded">.xlsx</span>
                  <span className="text-xs bg-[#262626] text-[#737373] px-2 py-0.5 rounded">.png</span>
                  <span className="text-xs bg-[#262626] text-[#737373] px-2 py-0.5 rounded">.jpg</span>
                  <span className="text-xs bg-[#262626] text-[#525252] px-2 py-0.5 rounded">any format</span>
                </div>
                <p className="text-xs text-[#525252] mt-1">
                  Auto-extracts from any layout including photos of handwritten logs
                </p>
              </button>
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
                  {importMode === 'manual'
                    ? 'Excel (.xlsx, .xls) or CSV files only'
                    : 'Excel (.xlsx, .xls) or Images (.png, .jpg)'}
                </p>
                {importMode === 'ai' && (
                  <p className="text-xs text-[#525252] mt-1">
                    Upload multiple files to combine data
                  </p>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept={importMode === 'manual' ? '.xlsx,.xls,.csv' : '.xlsx,.xls,.csv,image/*'}
                multiple={importMode === 'ai'}
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

              {importMode === 'ai' ? (
                <>
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
                </>
              ) : (
                <>
                  {/* Template Format Guide */}
                  <div className="p-4 bg-[#1a1a1a] rounded-xl space-y-3">
                    <p className="text-sm font-medium text-white">Required Excel Format</p>
                    <p className="text-xs text-[#737373]">
                      Your file should have a header row with these columns:
                    </p>

                    {/* Format table */}
                    <div className="overflow-x-auto rounded-lg border border-[#333]">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-[#f97316]/20">
                            <th className="px-2 py-1.5 text-left text-[#f97316] font-semibold">Date</th>
                            <th className="px-2 py-1.5 text-left text-[#f97316] font-semibold">Category</th>
                            <th className="px-2 py-1.5 text-left text-[#f97316] font-semibold">Exercise</th>
                            <th className="px-2 py-1.5 text-left text-[#f97316] font-semibold">Weight</th>
                            <th className="px-2 py-1.5 text-left text-[#f97316] font-semibold">Reps</th>
                            <th className="px-2 py-1.5 text-left text-[#f97316] font-semibold">Sets</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-t border-[#333]">
                            <td className="px-2 py-1.5 text-[#a3a3a3]">2024-01-15</td>
                            <td className="px-2 py-1.5 text-[#a3a3a3]">Chest</td>
                            <td className="px-2 py-1.5 text-white">Bench Press</td>
                            <td className="px-2 py-1.5 text-[#a3a3a3]">60</td>
                            <td className="px-2 py-1.5 text-[#a3a3a3]">10</td>
                            <td className="px-2 py-1.5 text-[#a3a3a3]">3</td>
                          </tr>
                          <tr className="border-t border-[#333]">
                            <td className="px-2 py-1.5 text-[#a3a3a3]">2024-01-15</td>
                            <td className="px-2 py-1.5 text-[#a3a3a3]">Legs</td>
                            <td className="px-2 py-1.5 text-white">Squat</td>
                            <td className="px-2 py-1.5 text-[#a3a3a3]">80</td>
                            <td className="px-2 py-1.5 text-[#a3a3a3]">8</td>
                            <td className="px-2 py-1.5 text-[#a3a3a3]">4</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="space-y-1 text-xs text-[#525252]">
                      <p><span className="text-white">Exercise</span> - Required (exercise name)</p>
                      <p><span className="text-[#737373]">Date</span> - Optional (defaults to today)</p>
                      <p><span className="text-[#737373]">Category</span> - Optional (defaults to "Uncategorized")</p>
                      <p><span className="text-[#737373]">Weight/Reps/Sets</span> - Optional (defaults to 0/0/1)</p>
                    </div>

                    <button
                      onClick={downloadTemplate}
                      className="w-full py-2 px-3 bg-[#262626] hover:bg-[#333] rounded-lg text-sm text-[#f97316] font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                      <DownloadIcon className="w-4 h-4" />
                      Download Template
                    </button>
                  </div>

                  <button onClick={() => setStep('mode')} className="btn-secondary w-full">
                    Back to Import Options
                  </button>
                </>
              )}
            </div>
          )}

          {/* Step 2.5: Column Mapping (Manual Mode) */}
          {step === 'mapping' && (
            <div className="space-y-4">
              <div className="p-3 bg-[#22c55e]/10 border border-[#22c55e]/20 rounded-xl">
                <p className="text-sm text-[#22c55e] font-medium">Column auto-detection complete</p>
                <p className="text-xs text-[#737373] mt-1">Review and adjust the column mapping below</p>
              </div>

              <div className="space-y-3">
                {/* Required columns */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-white">Exercise Column *</label>
                  <select
                    value={columnMapping.exercise ?? ''}
                    onChange={(e) => setColumnMapping({ ...columnMapping, exercise: e.target.value ? parseInt(e.target.value) : null })}
                    className="input"
                  >
                    <option value="">Select column...</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Date</label>
                    <select
                      value={columnMapping.date ?? ''}
                      onChange={(e) => setColumnMapping({ ...columnMapping, date: e.target.value ? parseInt(e.target.value) : null })}
                      className="input"
                    >
                      <option value="">None</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Category</label>
                    <select
                      value={columnMapping.category ?? ''}
                      onChange={(e) => setColumnMapping({ ...columnMapping, category: e.target.value ? parseInt(e.target.value) : null })}
                      className="input"
                    >
                      <option value="">None</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Weight (kg)</label>
                    <select
                      value={columnMapping.weight ?? ''}
                      onChange={(e) => setColumnMapping({ ...columnMapping, weight: e.target.value ? parseInt(e.target.value) : null })}
                      className="input"
                    >
                      <option value="">None</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Reps</label>
                    <select
                      value={columnMapping.reps ?? ''}
                      onChange={(e) => setColumnMapping({ ...columnMapping, reps: e.target.value ? parseInt(e.target.value) : null })}
                      className="input"
                    >
                      <option value="">None</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Sets Count</label>
                    <select
                      value={columnMapping.sets ?? ''}
                      onChange={(e) => setColumnMapping({ ...columnMapping, sets: e.target.value ? parseInt(e.target.value) : null })}
                      className="input"
                    >
                      <option value="">None (default: 1)</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Default category if no category column */}
                {columnMapping.category === null && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-white">Default Category</label>
                    <input
                      type="text"
                      value={defaultCategory}
                      onChange={(e) => setDefaultCategory(e.target.value)}
                      placeholder="Uncategorized"
                      className="input"
                    />
                    <p className="text-xs text-[#525252]">Used when no category column is mapped</p>
                  </div>
                )}
              </div>

              {/* Preview */}
              {previewRows.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-white">Data Preview</p>
                  <div className="overflow-x-auto rounded-lg border border-[#1a1a1a]">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-[#1a1a1a]">
                          {headers.slice(0, 6).map((h, i) => (
                            <th key={i} className="px-2 py-1.5 text-left text-[#737373] font-medium">
                              {h || `Col ${i + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.slice(0, 3).map((row, ri) => (
                          <tr key={ri} className="border-t border-[#1a1a1a]">
                            {row.slice(0, 6).map((cell, ci) => (
                              <td key={ci} className="px-2 py-1.5 text-white truncate max-w-[100px]">
                                {String(cell || '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-[#525252]">Showing first 3 of {allRows.length - 1} data rows</p>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => { setStep('upload'); setUploadedFiles([]); }} className="btn-secondary flex-1">
                  Back
                </button>
                <button
                  onClick={handleManualPreview}
                  disabled={columnMapping.exercise === null}
                  className="btn-primary flex-1"
                >
                  Continue
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
