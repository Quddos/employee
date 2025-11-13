import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

type GeneratePayload = {
  employee?: Record<string, unknown>;
  analysis?: {
    summary?: {
      total?: number;
      attritionRate?: number;
      topDepartments?: Array<{ department: string; attritionRate: number; count: number }>;
      numericCols?: string[];
    };
    employee?: Record<string, unknown>;
    similar?: Array<{ index: number; distance: number; row: Record<string, unknown> }>;
  };
};

type StrategyResponse = {
  strategy: string;
  model: string;
};

const buildPrompt = (employee: Record<string, unknown>, analysis: NonNullable<GeneratePayload["analysis"]>): string => {
  const { summary, similar } = analysis;
  const summaryLines = [
    `Dataset summary: total rows = ${summary?.total ?? "unknown"}, overall attrition rate = ${summary?.attritionRate ?? "unknown"}%`,
    `Top departments by attrition: ${
      summary?.topDepartments?.length
        ? summary.topDepartments.map((d) => `${d.department} (${d.attritionRate}% over ${d.count} employees)`).join(", ")
        : "not available"
    }`,
    `Numeric columns used for similarity: ${summary?.numericCols?.length ? summary.numericCols.join(", ") : "none"}`
  ].join("\n");

  const employeeLines = Object.entries(employee)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");

  const similarLines = similar
    ?.slice(0, 5)
    .map((entry) => {
      const parts = [`idx ${entry.index}`, `distance ${entry.distance.toFixed(3)}`];
      const attrition = entry.row?.Attrition ?? entry.row?.attrition;
      if (attrition !== undefined) {
        parts.push(`attrition: ${attrition}`);
      }
      return `${parts.join(" | ")} -> ${Object.entries(entry.row)
        .slice(0, 6)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ")}`;
    })
    .join("\n");

  return `You are an HR analytics assistant.

${summaryLines}

We have a target employee with the following attributes:
${employeeLines}

Here are the top 5 most similar employees from historical data:
${similarLines || "Not available"}

The target employee is considered valuable to retain.

Produce 3 concise, high-leverage retention strategies. Each strategy must:
- be personalized to the employee attributes,
- reference one or more signals from the dataset,
- include an action owner, next step, and expected timeline,
- provide one KPI with an initial benchmark and desired outcome.

Return the response as a numbered list (1., 2., 3.). Limit each strategy to at most 6 lines.`;
};

const MODEL_FALLBACK_CHAIN = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-exp",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-1.5-pro",
  "gemini-pro",
  "gemini-1.0-pro-latest",
];

const normalizeErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error occurred while contacting Gemini.";
};

const isModelNotFound = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  return /404/.test(error.message) && /model/i.test(error.message);
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GeneratePayload;
    const { employee, analysis } = body;

    if (!employee || !analysis) {
      return NextResponse.json({ error: "Request must include employee and analysis payloads." }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GOOGLE_API_KEY. Set it in your environment or .env.local file." },
        { status: 500 },
      );
    }

    const preferredModel = process.env.GEMINI_MODEL?.trim();
    const modelCandidates = Array.from(
      new Set([preferredModel, ...MODEL_FALLBACK_CHAIN].filter((model): model is string => Boolean(model))),
    );

    const prompt = buildPrompt(employee, analysis);
    const genAI = new GoogleGenerativeAI(apiKey);

    let lastError: unknown = null;
    const attemptErrors: Array<{ model: string; message: string }> = [];

    for (const modelName of modelCandidates) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            temperature: 0.25,
            topP: 0.8,
            maxOutputTokens: 768,
          },
          safetySettings: [],
          systemInstruction:
            "You are an expert HR business partner. You focus on retention outcomes, quantify impact, and keep answers pragmatic.",
        });

        const result = await model.generateContent({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseMimeType: "text/plain",
          },
        });

        const text = result.response.text();
        const payload: StrategyResponse = {
          strategy: text,
          model: modelName,
        };

        return NextResponse.json(payload);
      } catch (error) {
        lastError = error;
        attemptErrors.push({ model: modelName, message: normalizeErrorMessage(error) });
        if (isModelNotFound(error)) {
          // Try next candidate.
          continue;
        }

        console.error("[api/generate] error", error);
        const message = normalizeErrorMessage(error);
        return NextResponse.json({ error: message, attempts: attemptErrors }, { status: 502 });
      }
    }

    const message = `Gemini model unavailable. Set GEMINI_MODEL to a supported value (e.g. "gemini-1.5-flash-latest") or verify access in Google AI Studio. ${
      lastError ? `Last error: ${normalizeErrorMessage(lastError)}` : ""
    }`.trim();

    console.error("[api/generate] error", lastError);
    return NextResponse.json({ error: message, attempts: attemptErrors }, { status: 502 });
  } catch (error) {
    console.error("[api/generate] error", error);
    return NextResponse.json({ error: normalizeErrorMessage(error) }, { status: 500 });
  }
}

