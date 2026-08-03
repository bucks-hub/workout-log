import { useState } from 'react';
import { useStore } from '../store/useStore';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { LogoutIcon, DownloadIcon, UploadIcon, TrashIcon, ChevronRightIcon } from '../components/Icons';
import { ImportModal } from '../components/ImportModal';
import ExcelJS from 'exceljs';
import { getExportFilename } from '../utils/date';

// Color palette matching the app theme
const COLORS = {
  orange: 'FF9716',        // Primary orange
  orangeLight: 'FFECD9',   // Light orange background
  orangeMedium: 'FFD4A8',  // Medium orange
  gray: '737373',          // Gray text
  grayLight: 'F5F5F5',     // Light gray background
  grayMedium: 'E5E5E5',    // Medium gray
  grayDark: '525252',      // Dark gray
  white: 'FFFFFF',
  black: '0A0A0A',
  green: '22C55E',         // Success green
  greenLight: 'DCFCE7',    // Light green background
  blue: '3B82F6',          // Info blue
  blueLight: 'DBEAFE',     // Light blue background
};

export function Settings() {
  const { user } = useStore();
  const { signOut } = useAuth();
  const { categories, exercises, pendingSyncCount } = useStore();
  const [exporting, setExporting] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const handleExport = async () => {
    if (!user) return;

    setExporting(true);
    try {
      // Load all data
      const { data: sessions } = await supabase
        .from('sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      const { data: sets } = await supabase
        .from('sets')
        .select('*')
        .eq('user_id', user.id);

      if (!sessions || !sets) {
        alert('Failed to load data for export');
        return;
      }

      // Create workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Workout Log';
      workbook.created = new Date();

      // ============================================
      // SHEET 1: Gym Log Grid (Main tracking sheet)
      // ============================================
      const gridSheet = workbook.addWorksheet('Workout Log', {
        views: [{ state: 'frozen', xSplit: 1, ySplit: 6 }] // Freeze first column and 6 header rows
      });

      // Sort categories and exercises
      const sortedCats = [...categories].sort((a, b) => a.sort_order - b.sort_order);
      const sortedExs = [...exercises].sort((a, b) => {
        const catA = categories.find(c => c.id === a.category_id);
        const catB = categories.find(c => c.id === b.category_id);
        const catCompare = (catA?.sort_order || 0) - (catB?.sort_order || 0);
        if (catCompare !== 0) return catCompare;
        return a.sort_order - b.sort_order;
      });

      // Build exercise list grouped by category
      const exercisesByCategory: { category: typeof categories[0], exercises: typeof exercises }[] = [];
      sortedCats.forEach(cat => {
        const catExercises = sortedExs.filter(e => e.category_id === cat.id);
        if (catExercises.length > 0) {
          exercisesByCategory.push({ category: cat, exercises: catExercises });
        }
      });

      // Column configuration
      const FIXED_COLS = 7; // Date, spacer, Body Weight, Sleep hrs, Sleep quality, Energy, spacer
      const COLS_PER_EXERCISE = 3; // G, R, S

      // Set column widths
      gridSheet.getColumn(1).width = 14;  // Date
      gridSheet.getColumn(2).width = 2;   // Spacer
      gridSheet.getColumn(3).width = 12;  // Body Weight
      gridSheet.getColumn(4).width = 10;  // Sleep hours
      gridSheet.getColumn(5).width = 12;  // Sleep quality
      gridSheet.getColumn(6).width = 12;  // Energy level
      gridSheet.getColumn(7).width = 2;   // Spacer

      let colIndex = FIXED_COLS + 1;
      sortedExs.forEach(() => {
        gridSheet.getColumn(colIndex).width = 6;     // G
        gridSheet.getColumn(colIndex + 1).width = 5; // R
        gridSheet.getColumn(colIndex + 2).width = 5; // S
        colIndex += 3;
      });

      // Set row heights
      gridSheet.getRow(1).height = 25; // Category row
      gridSheet.getRow(2).height = 20; // ID row
      gridSheet.getRow(3).height = 22; // Name row
      gridSheet.getRow(4).height = 18; // Sub-category row
      gridSheet.getRow(5).height = 18; // G R S row
      gridSheet.getRow(6).height = 18; // Units row

      // ===== ROW 1: Category names =====
      const row1 = gridSheet.getRow(1);
      row1.getCell(1).value = '';

      let currentCol = FIXED_COLS + 1;
      const categoryColors = [COLORS.orange, COLORS.blue, COLORS.green, '9333EA', 'EC4899', '06B6D4'];
      let colorIndex = 0;

      exercisesByCategory.forEach(({ category, exercises: catExs }) => {
        const startCol = currentCol;
        const colSpan = catExs.length * COLS_PER_EXERCISE;

        // Merge cells for category name
        if (colSpan > 1) {
          gridSheet.mergeCells(1, startCol, 1, startCol + colSpan - 1);
        }

        const cell = row1.getCell(startCol);
        cell.value = category.name.toUpperCase();
        cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF' + categoryColors[colorIndex % categoryColors.length] }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF' + COLORS.grayDark } },
          bottom: { style: 'thin', color: { argb: 'FF' + COLORS.grayDark } },
          left: { style: 'thin', color: { argb: 'FF' + COLORS.grayDark } },
          right: { style: 'thin', color: { argb: 'FF' + COLORS.grayDark } }
        };

        currentCol += colSpan;
        colorIndex++;
      });

      // ===== ROW 2: ID row with exercise numbers =====
      const row2 = gridSheet.getRow(2);
      row2.getCell(1).value = 'ID';
      row2.getCell(1).font = { bold: true, size: 10 };
      row2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.grayLight } };

      row2.getCell(3).value = 'Body Weight';
      row2.getCell(3).font = { bold: true, size: 9 };
      row2.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.blueLight } };
      row2.getCell(3).alignment = { horizontal: 'center', textRotation: 90 };
      gridSheet.mergeCells(2, 3, 5, 3);

      row2.getCell(4).value = 'Sleep hours';
      row2.getCell(4).font = { bold: true, size: 9 };
      row2.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.greenLight } };
      row2.getCell(4).alignment = { horizontal: 'center', textRotation: 90 };
      gridSheet.mergeCells(2, 4, 5, 4);

      row2.getCell(5).value = 'Sleep quality';
      row2.getCell(5).font = { bold: true, size: 9 };
      row2.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.greenLight } };
      row2.getCell(5).alignment = { horizontal: 'center', textRotation: 90 };
      gridSheet.mergeCells(2, 5, 5, 5);

      row2.getCell(6).value = 'Energy level';
      row2.getCell(6).font = { bold: true, size: 9 };
      row2.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.orangeLight } };
      row2.getCell(6).alignment = { horizontal: 'center', textRotation: 90 };
      gridSheet.mergeCells(2, 6, 5, 6);

      let exerciseNum = 1;
      currentCol = FIXED_COLS + 1;
      colorIndex = 0;
      exercisesByCategory.forEach(({ exercises: catExs }) => {
        const lightColor = [COLORS.orangeLight, COLORS.blueLight, COLORS.greenLight, 'F3E8FF', 'FCE7F3', 'CFFAFE'][colorIndex % 6];
        catExs.forEach(() => {
          // Merge the 3 columns for exercise number
          gridSheet.mergeCells(2, currentCol, 2, currentCol + 2);
          const cell = row2.getCell(currentCol);
          cell.value = exerciseNum;
          cell.font = { bold: true, size: 11 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + lightColor } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF' + COLORS.grayMedium } },
            bottom: { style: 'thin', color: { argb: 'FF' + COLORS.grayMedium } },
            left: { style: 'thin', color: { argb: 'FF' + COLORS.grayMedium } },
            right: { style: 'thin', color: { argb: 'FF' + COLORS.grayMedium } }
          };
          exerciseNum++;
          currentCol += 3;
        });
        colorIndex++;
      });

      // ===== ROW 3: Exercise names =====
      const row3 = gridSheet.getRow(3);
      row3.getCell(1).value = 'Name';
      row3.getCell(1).font = { bold: true, size: 10 };
      row3.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.grayLight } };

      currentCol = FIXED_COLS + 1;
      colorIndex = 0;
      exercisesByCategory.forEach(({ exercises: catExs }) => {
        const lightColor = [COLORS.orangeLight, COLORS.blueLight, COLORS.greenLight, 'F3E8FF', 'FCE7F3', 'CFFAFE'][colorIndex % 6];
        catExs.forEach((ex) => {
          gridSheet.mergeCells(3, currentCol, 3, currentCol + 2);
          const cell = row3.getCell(currentCol);
          cell.value = ex.name;
          cell.font = { bold: true, size: 9 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + lightColor } };
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF' + COLORS.grayMedium } },
            bottom: { style: 'thin', color: { argb: 'FF' + COLORS.grayMedium } },
            left: { style: 'thin', color: { argb: 'FF' + COLORS.grayMedium } },
            right: { style: 'thin', color: { argb: 'FF' + COLORS.grayMedium } }
          };
          currentCol += 3;
        });
        colorIndex++;
      });

      // ===== ROW 4: Sub-category (category name repeated) =====
      const row4 = gridSheet.getRow(4);
      row4.getCell(1).value = '';
      row4.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.grayLight } };

      currentCol = FIXED_COLS + 1;
      colorIndex = 0;
      exercisesByCategory.forEach(({ category, exercises: catExs }) => {
        const lightColor = [COLORS.orangeLight, COLORS.blueLight, COLORS.greenLight, 'F3E8FF', 'FCE7F3', 'CFFAFE'][colorIndex % 6];
        catExs.forEach(() => {
          gridSheet.mergeCells(4, currentCol, 4, currentCol + 2);
          const cell = row4.getCell(currentCol);
          cell.value = category.name;
          cell.font = { size: 8, color: { argb: 'FF' + COLORS.gray } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + lightColor } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          currentCol += 3;
        });
        colorIndex++;
      });

      // ===== ROW 5: G R S headers =====
      const row5 = gridSheet.getRow(5);
      row5.getCell(1).value = '';
      row5.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.grayLight } };

      currentCol = FIXED_COLS + 1;
      exercisesByCategory.forEach(({ exercises: catExs }) => {
        catExs.forEach(() => {
          ['G', 'R', 'S'].forEach((label, i) => {
            const cell = row5.getCell(currentCol + i);
            cell.value = label;
            cell.font = { bold: true, size: 9 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.grayMedium } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FF' + COLORS.grayDark } },
              bottom: { style: 'thin', color: { argb: 'FF' + COLORS.grayDark } },
              left: { style: 'hair', color: { argb: 'FF' + COLORS.grayDark } },
              right: { style: 'hair', color: { argb: 'FF' + COLORS.grayDark } }
            };
          });
          currentCol += 3;
        });
      });

      // ===== ROW 6: Units =====
      const row6 = gridSheet.getRow(6);
      row6.getCell(1).value = 'Date';
      row6.getCell(1).font = { bold: true, size: 10 };
      row6.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.grayLight } };
      row6.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

      row6.getCell(3).value = 'kg';
      row6.getCell(3).font = { size: 8, color: { argb: 'FF' + COLORS.gray } };
      row6.getCell(3).alignment = { horizontal: 'center' };

      row6.getCell(4).value = 'hrs';
      row6.getCell(4).font = { size: 8, color: { argb: 'FF' + COLORS.gray } };
      row6.getCell(4).alignment = { horizontal: 'center' };

      row6.getCell(5).value = '1-10';
      row6.getCell(5).font = { size: 8, color: { argb: 'FF' + COLORS.gray } };
      row6.getCell(5).alignment = { horizontal: 'center' };

      row6.getCell(6).value = '1-10';
      row6.getCell(6).font = { size: 8, color: { argb: 'FF' + COLORS.gray } };
      row6.getCell(6).alignment = { horizontal: 'center' };

      currentCol = FIXED_COLS + 1;
      exercisesByCategory.forEach(({ exercises: catExs }) => {
        catExs.forEach(() => {
          ['kg', 'no.', 'no.'].forEach((unit, i) => {
            const cell = row6.getCell(currentCol + i);
            cell.value = unit;
            cell.font = { size: 8, color: { argb: 'FF' + COLORS.gray } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.grayLight } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          });
          currentCol += 3;
        });
      });

      // ===== DATA ROWS =====
      const chronologicalSessions = [...sessions].sort((a, b) =>
        a.date.localeCompare(b.date)
      );

      let dataRowIndex = 7;
      chronologicalSessions.forEach((session, sessionIndex) => {
        const row = gridSheet.getRow(dataRowIndex);
        row.height = 20;

        // Alternating row colors
        const rowColor = sessionIndex % 2 === 0 ? COLORS.white : COLORS.grayLight;

        // Date column
        const dateObj = new Date(session.date);
        const formattedDate = dateObj.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        }).replace(/ /g, '-');

        const dateCell = row.getCell(1);
        dateCell.value = formattedDate;
        dateCell.font = { size: 10 };
        dateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowColor } };
        dateCell.alignment = { horizontal: 'left', vertical: 'middle' };
        dateCell.border = {
          bottom: { style: 'hair', color: { argb: 'FF' + COLORS.grayMedium } }
        };

        // Body metrics
        [
          { col: 3, value: session.body_weight },
          { col: 4, value: session.sleep_hours },
          { col: 5, value: session.sleep_quality },
          { col: 6, value: session.energy }
        ].forEach(({ col, value }) => {
          const cell = row.getCell(col);
          cell.value = value || '';
          cell.font = { size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowColor } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        // Exercise data
        currentCol = FIXED_COLS + 1;
        exercisesByCategory.forEach(({ exercises: catExs }) => {
          catExs.forEach((ex) => {
            const exerciseSets = sets.filter(
              (s) => s.session_id === session.id && s.exercise_id === ex.id
            );

            if (exerciseSets.length === 0) {
              [0, 1, 2].forEach((i) => {
                const cell = row.getCell(currentCol + i);
                cell.value = '';
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowColor } };
              });
            } else {
              const heaviest = exerciseSets.reduce((max, s) =>
                s.weight > max.weight ? s : max
              );

              const gCell = row.getCell(currentCol);
              gCell.value = heaviest.weight;
              gCell.font = { size: 10, bold: true };
              gCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowColor } };
              gCell.alignment = { horizontal: 'center', vertical: 'middle' };

              const rCell = row.getCell(currentCol + 1);
              rCell.value = heaviest.reps;
              rCell.font = { size: 10 };
              rCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowColor } };
              rCell.alignment = { horizontal: 'center', vertical: 'middle' };

              const sCell = row.getCell(currentCol + 2);
              sCell.value = exerciseSets.length;
              sCell.font = { size: 10, color: { argb: 'FF' + COLORS.gray } };
              sCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowColor } };
              sCell.alignment = { horizontal: 'center', vertical: 'middle' };
            }
            currentCol += 3;
          });
        });

        dataRowIndex++;
      });

      // ============================================
      // SHEET 2: Exercise Progress Summary
      // ============================================
      const progressSheet = workbook.addWorksheet('Progress', {
        views: [{ state: 'frozen', ySplit: 1 }]
      });

      // Headers
      const progressHeaders = ['Category', 'Exercise', 'Personal Best (kg)', 'Reps at PB', 'Total Sets', 'Total Volume (kg)', 'Last Performed'];
      const headerRow = progressSheet.getRow(1);
      headerRow.height = 25;

      progressHeaders.forEach((header, i) => {
        const cell = headerRow.getCell(i + 1);
        cell.value = header;
        cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.orange } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          bottom: { style: 'medium', color: { argb: 'FF' + COLORS.grayDark } }
        };
      });

      // Column widths
      progressSheet.getColumn(1).width = 15;
      progressSheet.getColumn(2).width = 25;
      progressSheet.getColumn(3).width = 18;
      progressSheet.getColumn(4).width = 12;
      progressSheet.getColumn(5).width = 12;
      progressSheet.getColumn(6).width = 18;
      progressSheet.getColumn(7).width = 15;

      // Data
      let progressRowIndex = 2;
      sortedExs.forEach((exercise, exIndex) => {
        const category = categories.find((c) => c.id === exercise.category_id);
        const exerciseSets = sets.filter((s) => s.exercise_id === exercise.id);

        const row = progressSheet.getRow(progressRowIndex);
        row.height = 22;
        const rowColor = exIndex % 2 === 0 ? COLORS.white : COLORS.grayLight;

        row.getCell(1).value = category?.name || '-';
        row.getCell(2).value = exercise.name;

        if (exerciseSets.length > 0) {
          const bestSet = exerciseSets.reduce((max, s) => s.weight > max.weight ? s : max);
          const totalVolume = exerciseSets.reduce((sum, s) => sum + (s.weight * s.reps), 0);
          const lastSession = sessions
            .filter((session) => exerciseSets.some((s) => s.session_id === session.id))
            .sort((a, b) => b.date.localeCompare(a.date))[0];

          row.getCell(3).value = bestSet.weight;
          row.getCell(4).value = bestSet.reps;
          row.getCell(5).value = exerciseSets.length;
          row.getCell(6).value = totalVolume;
          row.getCell(7).value = lastSession?.date || '-';
        } else {
          row.getCell(3).value = '-';
          row.getCell(4).value = '-';
          row.getCell(5).value = 0;
          row.getCell(6).value = 0;
          row.getCell(7).value = 'Never';
        }

        // Style all cells in the row
        for (let i = 1; i <= 7; i++) {
          const cell = row.getCell(i);
          cell.font = { size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowColor } };
          cell.alignment = { horizontal: i <= 2 ? 'left' : 'center', vertical: 'middle' };
          cell.border = {
            bottom: { style: 'hair', color: { argb: 'FF' + COLORS.grayMedium } }
          };
        }

        progressRowIndex++;
      });

      // ============================================
      // SHEET 3: All Sets Detail
      // ============================================
      const detailSheet = workbook.addWorksheet('All Sets', {
        views: [{ state: 'frozen', ySplit: 1 }]
      });

      const detailHeaders = ['Date', 'Day', 'Category', 'Exercise', 'Set #', 'Weight (kg)', 'Reps', 'Volume (kg)'];
      const detailHeaderRow = detailSheet.getRow(1);
      detailHeaderRow.height = 25;

      detailHeaders.forEach((header, i) => {
        const cell = detailHeaderRow.getCell(i + 1);
        cell.value = header;
        cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + COLORS.blue } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      detailSheet.getColumn(1).width = 12;
      detailSheet.getColumn(2).width = 10;
      detailSheet.getColumn(3).width = 15;
      detailSheet.getColumn(4).width = 20;
      detailSheet.getColumn(5).width = 8;
      detailSheet.getColumn(6).width = 12;
      detailSheet.getColumn(7).width = 8;
      detailSheet.getColumn(8).width = 12;

      const sortedSets = [...sets].sort((a, b) => {
        const sessionA = sessions.find((s) => s.id === a.session_id);
        const sessionB = sessions.find((s) => s.id === b.session_id);
        return (sessionB?.date || '').localeCompare(sessionA?.date || '');
      });

      let detailRowIndex = 2;
      sortedSets.forEach((set, setIndex) => {
        const session = sessions.find((s) => s.id === set.session_id);
        const exercise = exercises.find((e) => e.id === set.exercise_id);
        const category = categories.find((c) => c.id === exercise?.category_id);

        const date = session ? new Date(session.date) : new Date();
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

        const row = detailSheet.getRow(detailRowIndex);
        row.height = 20;
        const rowColor = setIndex % 2 === 0 ? COLORS.white : COLORS.grayLight;

        row.getCell(1).value = session?.date || '-';
        row.getCell(2).value = dayName;
        row.getCell(3).value = category?.name || '-';
        row.getCell(4).value = exercise?.name || '-';
        row.getCell(5).value = set.set_number;
        row.getCell(6).value = set.weight;
        row.getCell(7).value = set.reps;
        row.getCell(8).value = set.weight * set.reps;

        for (let i = 1; i <= 8; i++) {
          const cell = row.getCell(i);
          cell.font = { size: 10 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowColor } };
          cell.alignment = { horizontal: i <= 4 ? 'left' : 'center', vertical: 'middle' };
        }

        detailRowIndex++;
      });

      // Generate buffer and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = getExportFilename();
      link.click();
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const handleDeleteAccount = async () => {
    // This would need server-side implementation
    alert('Account deletion requires contacting support.');
    setShowDeleteAccount(false);
  };

  return (
    <div className="page">
      {/* Header */}
      <div className="sticky top-0 bg-black border-b border-[#1a1a1a] p-4 z-10">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
      </div>

      <div className="p-4 space-y-6">
        {/* Account Section */}
        <div>
          <h2 className="text-xs font-semibold text-[#737373] uppercase tracking-wider mb-3 px-1">
            Account
          </h2>
          <div className="card divide-y divide-[#1a1a1a]">
            <div className="p-4">
              <div className="text-sm text-[#737373]">Signed in as</div>
              <div className="text-white font-medium">{user?.email}</div>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-[#111] transition-colors"
            >
              <div className="flex items-center gap-3 text-[#ef4444]">
                <LogoutIcon className="w-5 h-5" />
                <span className="font-medium">Sign Out</span>
              </div>
              <ChevronRightIcon className="w-5 h-5 text-[#525252]" />
            </button>
          </div>
        </div>

        {/* Data Section */}
        <div>
          <h2 className="text-xs font-semibold text-[#737373] uppercase tracking-wider mb-3 px-1">
            Data
          </h2>
          <div className="card divide-y divide-[#1a1a1a]">
            <button
              onClick={() => setShowImport(true)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-[#111] transition-colors"
            >
              <div className="flex items-center gap-3 text-white">
                <UploadIcon className="w-5 h-5 text-[#22c55e]" />
                <div>
                  <span className="font-medium">Import from Excel</span>
                  <p className="text-sm text-[#737373]">AI-powered import from any format</p>
                </div>
              </div>
              <ChevronRightIcon className="w-5 h-5 text-[#525252]" />
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-[#111] transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-3 text-white">
                <DownloadIcon className="w-5 h-5 text-[#f97316]" />
                <div>
                  <span className="font-medium">Export to Excel</span>
                  <p className="text-sm text-[#737373]">Download your complete workout history</p>
                </div>
              </div>
              <ChevronRightIcon className="w-5 h-5 text-[#525252]" />
            </button>
          </div>
        </div>

        {/* Stats Section */}
        <div>
          <h2 className="text-xs font-semibold text-[#737373] uppercase tracking-wider mb-3 px-1">
            Statistics
          </h2>
          <div className="card divide-y divide-[#1a1a1a]">
            <div className="p-4 flex items-center justify-between">
              <span className="text-[#a3a3a3]">Categories</span>
              <span className="text-white font-medium number">{categories.length}</span>
            </div>
            <div className="p-4 flex items-center justify-between">
              <span className="text-[#a3a3a3]">Exercises</span>
              <span className="text-white font-medium number">{exercises.length}</span>
            </div>
            <div className="p-4 flex items-center justify-between">
              <span className="text-[#a3a3a3]">Pending Sync</span>
              <span className={`font-medium number ${pendingSyncCount > 0 ? 'text-[#f97316]' : 'text-white'}`}>
                {pendingSyncCount}
              </span>
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div>
          <h2 className="text-xs font-semibold text-[#737373] uppercase tracking-wider mb-3 px-1">
            Danger Zone
          </h2>
          <div className="card">
            <button
              onClick={() => setShowDeleteAccount(true)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-[#111] transition-colors"
            >
              <div className="flex items-center gap-3 text-[#ef4444]">
                <TrashIcon className="w-5 h-5" />
                <div>
                  <span className="font-medium">Delete Account</span>
                  <p className="text-sm text-[#737373]">Permanently delete all your data</p>
                </div>
              </div>
              <ChevronRightIcon className="w-5 h-5 text-[#525252]" />
            </button>
          </div>
        </div>

        {/* App Info */}
        <div className="text-center text-sm text-[#525252] pt-4">
          <p>Workout Log v1.0</p>
        </div>
      </div>

      {/* Delete Account Confirmation */}
      {showDeleteAccount && (
        <div className="modal-backdrop" onClick={() => setShowDeleteAccount(false)}>
          <div className="modal-content max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 space-y-4">
              <h3 className="text-lg font-semibold text-white">Delete Account?</h3>
              <p className="text-[#a3a3a3]">
                This will permanently delete your account and all your workout data. This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <button onClick={handleDeleteAccount} className="btn-danger flex-1">
                  Delete Account
                </button>
                <button onClick={() => setShowDeleteAccount(false)} className="btn-secondary flex-1">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  );
}
