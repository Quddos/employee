'use client';

import Papa from 'papaparse';
import { useCallback, useMemo, useState } from 'react';

type CsvRow = Record<string, string | number | boolean | null | undefined>;

type AnalysisResponse = {
  summary: {
    total: number;
    attritionRate: number;
    topDepartments: Array<{ department: string; attritionRate: number; count: number }>;
    numericCols: string[];
  };
  employee: CsvRow;
  similar: Array<{ index: number; distance: number; row: CsvRow }>;
};

type EmployeeOption = {
  index: number;
  label: string;
  labelLower: string;
  row: CsvRow;
};

type StatusTone = 'info' | 'success' | 'error';

type StatusState = {
  message: string;
  tone: StatusTone;
};

const statusToneStyles: Record<StatusTone, string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
};

const SAMPLE_DATASET_PATH = '/kaggle WA_Fn-UseC_-HR-Employee-Attrition.csv';

const buildEmployeeLabel = (row: CsvRow, index: number): string => {
  const employeeNumber = row.EmployeeNumber ?? row.employeeNumber ?? index;
  const department = row.Department ?? row.department ?? 'Department N/A';
  const role = row.JobRole ?? row.jobRole ?? 'Role N/A';
  const name = row.EmployeeName ?? row.employeeName;
  const displayName = name ? `${name}` : `Employee ${employeeNumber}`;
  return `${displayName} — ${role} (${department}) [#${index}]`;
};

const formatPercent = (value: number) => `${value.toFixed(2)}%`;

export default function HomePage() {
  const [csvData, setCsvData] = useState<CsvRow[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [strategies, setStrategies] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState<StatusState | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const updateStatus = useCallback((message: string, tone: StatusTone = 'info') => {
    setStatus({ message, tone });
  }, []);

  const employeeOptions: EmployeeOption[] = useMemo(() => {
    return csvData.map((row, index) => {
      const label = buildEmployeeLabel(row, index);
      return {
        index,
        label,
        labelLower: label.toLowerCase(),
        row,
      };
    });
  }, [csvData]);

  const filteredEmployees = useMemo(() => {
    if (!searchTerm) {
      return employeeOptions.slice(0, 25);
    }
    const term = searchTerm.toLowerCase();
    return employeeOptions
      .filter((option) => option.labelLower.includes(term) || option.index.toString() === term)
      .slice(0, 50);
  }, [employeeOptions, searchTerm]);

  const previewRows = useMemo(() => csvData.slice(0, 10), [csvData]);

  const resetState = useCallback(() => {
    setAnalysis(null);
    setStrategies(null);
    setStatus(null);
  }, []);

  const handleParsedData = useCallback(
    (rows: CsvRow[]) => {
      const validRows = rows.filter((row) => Object.keys(row).length > 0);
      setCsvData(validRows);
      setSelectedIndex(validRows.length ? 0 : null);
      resetState();
    },
    [resetState],
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    updateStatus(`Parsing ${file.name}…`);
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => {
        handleParsedData(results.data);
        updateStatus(`Loaded ${results.data.length.toLocaleString()} rows from ${file.name}.`, 'success');
      },
      error: (error) => {
        console.error('CSV parse error', error);
        updateStatus(`Unable to parse CSV: ${error.message}`, 'error');
      },
    });
  };

  const loadSampleDataset = useCallback(() => {
    updateStatus('Loading sample dataset…');
    Papa.parse<CsvRow>(SAMPLE_DATASET_PATH, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        handleParsedData(results.data);
        updateStatus(`Loaded ${results.data.length.toLocaleString()} rows from sample dataset.`, 'success');
      },
      error: (error) => {
        console.error('Sample dataset error', error);
        updateStatus(`Unable to load sample dataset: ${error.message}`, 'error');
      },
    });
  }, [handleParsedData, updateStatus]);

  const analyzeSelectedEmployee = useCallback(async () => {
    if (!csvData.length || selectedIndex === null) {
      updateStatus('Upload a dataset and select an employee first.', 'error');
      return;
    }

    setIsAnalyzing(true);
    updateStatus('Analyzing dataset…');
    setStrategies(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset: csvData, index: selectedIndex }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Analysis failed.');
      }

      setAnalysis(payload as AnalysisResponse);
      updateStatus(`Analysis ready for employee #${selectedIndex}.`, 'success');
    } catch (error) {
      console.error('Analyze error', error);
      updateStatus(error instanceof Error ? error.message : 'Unexpected error during analysis.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  }, [csvData, selectedIndex, updateStatus]);

  const generateRetentionStrategies = useCallback(async () => {
    if (!analysis) {
      updateStatus('Run an analysis before generating strategies.', 'error');
      return;
    }

    setIsGenerating(true);
    updateStatus('Requesting retention strategies from Gemini…');

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee: analysis.employee, analysis }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to generate strategies.');
      }

      setStrategies(payload.strategy ?? '');
      updateStatus(
        payload.model ? `Gemini response generated with ${payload.model}.` : 'Gemini response received.',
        'success',
      );
    } catch (error) {
      console.error('Generate error', error);
      updateStatus(error instanceof Error ? error.message : 'Unexpected error during generation.', 'error');
    } finally {
      setIsGenerating(false);
    }
  }, [analysis, updateStatus]);

  const selectedEmployee = useMemo(() => {
    if (selectedIndex === null || !csvData[selectedIndex]) {
      return null;
    }
    return csvData[selectedIndex];
  }, [csvData, selectedIndex]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12">
        <header className="space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold tracking-wide text-sky-700">
            HR analytics · retention strategy
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">HR Analytics & Retention Co-Pilot</h1>
          <p className="max-w-3xl text-base text-slate-600">
            Upload the <em>WA_Fn-UseC_-HR-Employee-Attrition</em> dataset (or load the bundled sample), pinpoint high-risk talent,
            explore lookalike employees, and request Gemini-powered retention plays in one streamlined workflow.
          </p>
        </header>

        <section className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">1. Load dataset</h2>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 hover:border-slate-400 hover:text-slate-800">
              <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              <span>Upload CSV</span>
            </label>
            <button
              type="button"
              onClick={loadSampleDataset}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700"
            >
              Load sample dataset
            </button>
            {csvData.length > 0 && (
              <span className="text-sm font-medium text-slate-500">{csvData.length.toLocaleString()} rows loaded</span>
            )}
          </div>
          {status && (
            <div className={`rounded-md border px-3 py-2 text-sm shadow-sm transition ${statusToneStyles[status.tone]}`}>
              {status.message}
            </div>
          )}
          {previewRows.length > 0 && (
            <div className="w-full overflow-hidden rounded-xl border border-slate-200">
              <div className="max-h-64 overflow-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                  <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      {Object.keys(previewRows[0] ?? {})
                        .slice(0, 8)
                        .map((key) => (
                          <th key={key} className="px-3 py-2">
                            {key}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="odd:bg-white even:bg-slate-50">
                        <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-600">{rowIndex}</td>
                        {Object.entries(row)
                          .slice(0, 8)
                          .map(([key, value]) => (
                            <td key={key} className="px-3 py-2 text-slate-600">
                              {String(value ?? '')}
                            </td>
                          ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">2. Select employee</h2>
          <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by role, department, or employee number…"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none"
                />
                <select
                  value={selectedIndex ?? ''}
                  onChange={(event) => setSelectedIndex(event.target.value ? Number(event.target.value) : null)}
                  className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none"
                >
                  <option value="">Choose via list…</option>
                  {filteredEmployees.map((option) => (
                    <option key={option.index} value={option.index}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {filteredEmployees.length > 0 ? (
                <ul className="grid max-h-60 gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-gradient-to-b from-white via-white to-slate-50 p-3 text-sm">
                  {filteredEmployees.map((option) => (
                    <li
                      key={option.index}
                      className={`cursor-pointer rounded-lg px-3 py-2 shadow-sm transition ${
                        selectedIndex === option.index
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                      onClick={() => setSelectedIndex(option.index)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{option.label}</span>
                        <span className="text-xs uppercase tracking-wide text-slate-400">#{option.index}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500">
                  No employees match that search yet.
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-4 text-sm text-slate-600 shadow-inner">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Selected employee snapshot</h3>
              {selectedEmployee ? (
                <dl className="space-y-2">
                  {(Object.entries(selectedEmployee) as [string, unknown][])
                    .slice(0, 12)
                    .map(([key, value]) => (
                      <div key={key} className="flex justify-between gap-3">
                        <dt className="truncate font-medium text-slate-500">{key}</dt>
                        <dd className="max-w-[55%] truncate text-right text-slate-700">{String(value ?? '')}</dd>
                      </div>
                    ))}
                  <p className="mt-3 text-xs text-slate-500">Full record is included when generating strategies.</p>
                </dl>
              ) : (
                <p>Select an employee to preview their attributes.</p>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={analyzeSelectedEmployee}
              disabled={!csvData.length || selectedIndex === null || isAnalyzing}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isAnalyzing ? 'Analyzing…' : 'Analyze selected employee'}
            </button>
          </div>
        </section>

        {analysis && (
          <section className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold text-slate-900">3. Insights</h2>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Ready for Gemini
              </span>
            </header>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50 to-sky-100 p-4 text-sky-900 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-sky-600">Dataset rows</p>
                <p className="text-3xl font-semibold">{analysis.summary.total.toLocaleString()}</p>
                <p className="text-xs text-sky-700/70">Records available for analysis</p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-emerald-100 p-4 text-emerald-900 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-emerald-600">Attrition rate</p>
                <p className="text-3xl font-semibold">{formatPercent(analysis.summary.attritionRate)}</p>
                <p className="text-xs text-emerald-700/70">Overall dataset attrition</p>
              </div>
              <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 via-amber-50 to-rose-50 p-4 text-amber-900 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-amber-600">Similarity features</p>
                <p className="text-sm font-medium text-amber-900">
                  {analysis.summary.numericCols.length ? analysis.summary.numericCols.join(', ') : 'None detected'}
                </p>
                <p className="mt-1 text-xs text-amber-700/70">Numeric columns included in distance scoring</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr,1fr]">
              <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-emerald-900">Top departments by attrition</h3>
                <ul className="mt-3 space-y-2 text-sm text-emerald-700">
                  {analysis.summary.topDepartments.map((department) => (
                    <li key={department.department} className="flex justify-between gap-3">
                      <span className="font-medium">{department.department}</span>
                      <span>{formatPercent(department.attritionRate)} · {department.count} employees</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-indigo-900">Most similar employees</h3>
                <ol className="mt-3 space-y-2 text-sm text-indigo-700">
                  {analysis.similar.slice(0, 5).map((entry) => (
                    <li key={entry.index} className="flex justify-between gap-3">
                      <span className="font-medium">#{entry.index}</span>
                      <span className="truncate">
                        dist {entry.distance.toFixed(3)} · Attrition: {String(entry.row?.Attrition ?? entry.row?.attrition ?? 'N/A')}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="grid gap-4 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-inner">
              <h3 className="text-sm font-semibold text-slate-800">Employee payload sent to Gemini</h3>
              <pre className="max-h-72 overflow-auto rounded-lg bg-slate-900/95 px-4 py-3 text-sm text-slate-100 shadow-inner">
                {JSON.stringify(analysis.employee, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={generateRetentionStrategies}
                disabled={isGenerating}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isGenerating ? 'Generating with Gemini…' : 'Generate retention strategies'}
              </button>
            </div>
          </section>
        )}

        {strategies && (
          <section className="grid gap-4 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-slate-50 to-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-indigo-900">4. Gemini recommendations</h2>
            <div className="whitespace-pre-wrap rounded-xl border border-indigo-100 bg-white/90 px-4 py-4 text-sm leading-relaxed text-slate-800 shadow-inner">
              {strategies}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
