import { NextRequest, NextResponse } from "next/server";

type DatasetRow = Record<string, unknown>;

type AnalyzePayload = {
  dataset?: DatasetRow[];
  index?: number;
};

type DepartmentSummary = {
  department: string;
  count: number;
  attritionRate: number;
};

type SimilarEmployee = {
  index: number;
  distance: number;
  row: DatasetRow;
};

type AnalyzeResponse = {
  summary: {
    total: number;
    attritionRate: number;
    topDepartments: DepartmentSummary[];
    numericCols: string[];
  };
  employee: DatasetRow;
  similar: SimilarEmployee[];
};

const ATTRITION_FIELD = "Attrition";
const DEPARTMENT_FIELD = "Department";
const IGNORE_NUMERIC_COLUMNS = new Set(["employeenumber", "employeeid"]);

const isNumericLike = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return false;
    return !Number.isNaN(Number(trimmed));
  }
  return false;
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AnalyzePayload;

    if (!Array.isArray(body.dataset) || typeof body.index !== "number") {
      return NextResponse.json({ error: "Payload must include dataset[] and numeric index." }, { status: 400 });
    }

    const { dataset, index } = body;

    if (!dataset.length) {
      return NextResponse.json({ error: "Dataset is empty." }, { status: 400 });
    }

    if (index < 0 || index >= dataset.length) {
      return NextResponse.json({ error: "Selected employee index is out of bounds." }, { status: 400 });
    }

    const total = dataset.length;
    let attritionCount = 0;
    const departmentStats: Record<string, { count: number; attr: number }> = {};

    dataset.forEach((row) => {
      const attrRaw = String(row?.[ATTRITION_FIELD] ?? "").toLowerCase();
      const attrited = attrRaw === "yes" || attrRaw === "1" || attrRaw === "true";
      if (attrited) attritionCount += 1;

      const department = String(row?.[DEPARTMENT_FIELD] ?? "Unknown Department");
      if (!departmentStats[department]) {
        departmentStats[department] = { count: 0, attr: 0 };
      }
      departmentStats[department].count += 1;
      if (attrited) departmentStats[department].attr += 1;
    });

    const attritionRate = Number(((attritionCount / total) * 100).toFixed(2));
    const topDepartments: DepartmentSummary[] = Object.entries(departmentStats)
      .map(([department, { count, attr }]) => ({
        department,
        count,
        attritionRate: Number(((attr / count) * 100).toFixed(2)),
      }))
      .sort((a, b) => b.attritionRate - a.attritionRate)
      .slice(0, 5);

    const candidateColumns = Object.keys(dataset[0] ?? {});
    const numericCols: string[] = candidateColumns.filter((column) => {
      if (IGNORE_NUMERIC_COLUMNS.has(column.toLowerCase())) return false;
      const numericCount = dataset.reduce((acc, row) => (isNumericLike(row?.[column]) ? acc + 1 : acc), 0);
      return numericCount / total >= 0.7;
    });

    const numericMatrix = dataset.map((row) => numericCols.map((column) => toNumber(row?.[column])));

    const means = numericCols.map((_, columnIndex) => {
      const sum = numericMatrix.reduce((acc, numericRow) => acc + (numericRow[columnIndex] ?? 0), 0);
      return sum / numericMatrix.length;
    });

    const stdDevs = numericCols.map((_, columnIndex) => {
      const mean = means[columnIndex];
      const variance =
        numericMatrix.reduce((acc, numericRow) => {
          const value = numericRow[columnIndex] ?? 0;
          return acc + (value - mean) ** 2;
        }, 0) / numericMatrix.length;
      const std = Math.sqrt(variance);
      return std > 0 ? std : 1;
    });

    const normalizedMatrix = numericMatrix.map((numericRow) =>
      numericRow.map((value, columnIndex) => (value - means[columnIndex]) / stdDevs[columnIndex]),
    );

    const target = normalizedMatrix[index];

    const distances: SimilarEmployee[] = normalizedMatrix
      .map((numericRow, rowIndex) => {
        const distance = Math.sqrt(
          numericRow.reduce((acc, value, columnIndex) => {
            const diff = value - (target[columnIndex] ?? 0);
            return acc + diff * diff;
          }, 0),
        );
        return { index: rowIndex, distance, row: dataset[rowIndex] };
      })
      .sort((a, b) => a.distance - b.distance);

    const similar = distances.filter((entry) => entry.index !== index).slice(0, 10);

    const response: AnalyzeResponse = {
      summary: {
        total,
        attritionRate,
        topDepartments,
        numericCols,
      },
      employee: dataset[index],
      similar,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[api/analyze] error", error);
    return NextResponse.json({ error: "Unable to analyze dataset." }, { status: 500 });
  }
}

