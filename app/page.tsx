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
  const [status, setStatus] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

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
    return employeeOptions.filter((option) => option.labelLower.includes(term) || option.index.toString() === term).slice(0, 50);
  }, [employeeOptions, searchTerm]);

  const previewRows = useMemo(() => csvData.slice(0, 10), [csvData]);

  const resetState = useCallback(() => {
    setAnalysis(null);
    setStrategies(null);
    setStatus(null);
  }, []);

  const handleParsedData = useCallback((rows: CsvRow[]) => {
    const validRows = rows.filter((row) => Object.keys(row).length > 0);
    setCsvData(validRows);
    setSelectedIndex(validRows.length ? 0 : null);
    resetState();
  }, [resetState]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    setStatus(`Parsing ${file.name}…`);
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => {
        handleParsedData(results.data);
        setStatus(null);
      },
      error: (error) => {
        console.error('CSV parse error', error);
        setStatus(`Unable to parse CSV: ${error.message}`);
      },
    });
  };

  const loadSampleDataset = useCallback(() => {
    setStatus('Loading sample dataset…');
    Papa.parse<CsvRow>(SAMPLE_DATASET_PATH, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        handleParsedData(results.data);
        setStatus(null);
      },
      error: (error) => {
        console.error('Sample dataset error', error);
        setStatus(`Unable to load sample dataset: ${error.message}`);
      },
    });
  }, [handleParsedData]);

  const analyzeSelectedEmployee = useCallback(async () => {
    if (!csvData.length || selectedIndex === null) {
      setStatus('Upload a dataset and select an employee first.');
      return;
    }

    setIsAnalyzing(true);
    setStatus('Analyzing dataset…');
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
      setStatus(`Analysis ready for employee #${selectedIndex}.`);
    } catch (error) {
      console.error('Analyze error', error);
      setStatus(error instanceof Error ? error.message : 'Unexpected error during analysis.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [csvData, selectedIndex]);

  const generateRetentionStrategies = useCallback(async () => {
    if (!analysis) {
      setStatus('Run an analysis before generating strategies.');
      return;
    }

    setIsGenerating(true);
    setStatus('Contacting Gemini for retention strategies…');

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
      setStatus('Gemini response received.');
    } catch (error) {
      console.error('Generate error', error);
      setStatus(error instanceof Error ? error.message : 'Unexpected error during generation.');
    } finally {
      setIsGenerating(false);
    }
  }, [analysis]);

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
          <h1 className="text-3xl font-semibold tracking-tight">HR Analytics & Retention Co-Pilot</h1>
          <p className="max-w-3xl text-base text-slate-600">
            Upload the <em>WA_Fn-UseC_-HR-Employee-Attrition</em> dataset (or load the sample), analyze a specific employee, and generate
            targeted retention strategies powered by Gemini. All computation happens locally in your browser and on serverless Next.js API
            routes—no database required.
          </p>
        </header>

        <section className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">1. Load dataset</h2>
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
            {csvData.length > 0 && <span className="text-sm text-slate-500">{csvData.length.toLocaleString()} rows loaded</span>}
          </div>
          {status && <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{status}</div>}
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
          <h2 className="text-xl font-semibold">2. Select employee</h2>
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
                <ul className="grid max-h-60 gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  {filteredEmployees.map((option) => (
                    <li
                      key={option.index}
                      className={`cursor-pointer rounded-md px-3 py-2 transition ${
                        selectedIndex === option.index ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-100'
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

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Selected employee snapshot</h3>
              {selectedEmployee ? (
                <dl className="space-y-2">
                  {(Object.entries(selectedEmployee) as [string, unknown][])
                    .slice(0, 12)
                    .map(([key, value]) => (
                      <div key={key} className="flex justify-between gap-3">
                        <dt className="truncate font-medium text-slate-500">{key}</dt>
                        <dd className="max-w-[55%] truncate text-right">{String(value ?? '')}</dd>
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
              <h2 className="text-xl font-semibold">3. Insights</h2>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                Ready for Gemini
              </span>
            </header>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Dataset rows</p>
                <p className="text-3xl font-semibold text-slate-800">{analysis.summary.total.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Attrition rate</p>
                <p className="text-3xl font-semibold text-slate-800">{formatPercent(analysis.summary.attritionRate)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Numeric similarity fields</p>
                <p className="text-sm font-medium text-slate-700">
                  {analysis.summary.numericCols.length ? analysis.summary.numericCols.join(', ') : 'None detected'}
                </p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr,1fr]">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-800">Top departments by attrition</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {analysis.summary.topDepartments.map((department) => (
                    <li key={department.department} className="flex justify-between gap-3">
                      <span className="font-medium">{department.department}</span>
                      <span>{formatPercent(department.attritionRate)} · {department.count} employees</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-800">Most similar employees</h3>
                <ol className="mt-3 space-y-2 text-sm text-slate-600">
                  {analysis.similar.slice(0, 5).map((entry) => (
                    <li key={entry.index} className="flex justify-between gap-3">
                      <span>#{entry.index}</span>
                      <span className="truncate">dist {entry.distance.toFixed(3)} · Attrition: {String(entry.row?.Attrition ?? entry.row?.attrition ?? 'N/A')}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-slate-800">Employee payload sent to Gemini</h3>
              <pre className="max-h-72 overflow-auto rounded-lg bg-slate-900 px-4 py-3 text-sm text-slate-100">
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
          <section className="grid gap-4 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-indigo-900">4. Gemini recommendations</h2>
            <div className="whitespace-pre-wrap rounded-xl border border-indigo-200 bg-white px-4 py-4 text-sm leading-relaxed text-slate-800 shadow-inner">
              {strategies}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
