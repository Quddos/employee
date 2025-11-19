## HR Analytics & Retention Strategy App

Full-stack Next.js (App Router) demo for exploring the Kaggle **WA_Fn-UseC_-HR-Employee-Attrition** dataset, surfacing attrition insights for any employee, and generating targeted retention actions with Google Gemini.
# Employee_retention_strategy_suggestion
🧠 Employee Retention Prediction System (AI-Powered HRM)  Intelligent HR Decision Support System for predicting employee retention using Machine Learning, Explainable AI (SHAP), and a Progressive Web App (PWA) interface built with Next.js. Developed to empower HR departments with data-driven insights and actionable retention strategies.

🚀 Overview
Project Link: https://employeeretention.qudmeet.click/
PWA application code: https://github.com/Quddos/employee
Explainable AI and Model Training: https://github.com/Quddos/Employee_retention_strategy_suggestion

The Employee Retention Prediction System enables HR professionals to make evidence-based workforce decisions by analyzing employee attributes and predicting their likelihood to stay or leave.

<img width="1350" height="966" alt="image" src="https://github.com/user-attachments/assets/c1bba79b-55ae-4094-8f9f-4b89a7f19c9a" />


### Features

- Upload any attrition CSV (header row required) or load the bundled sample dataset.
- Search/filter to find an employee and trigger server-side similarity analysis.
- `/api/analyze` computes dataset stats, attrition by department, and k-nearest numeric neighbors.
- `/api/generate` crafts a structured prompt and calls Gemini (`@google/generative-ai`) for 3 actionable retention strategies.
- Frontend presents summaries, similar employees, and Gemini guidance in a clean, responsive layout.



### Prerequisites

- Node.js 18+
- A Google AI Studio API key with access to Gemini models.

### Environment

Create an `.env.local` in the project root:

```
GOOGLE_API_KEY=your-google-gemini-api-key
# Optional: override the default Gemini model (falls back to gemini-1.5-flash-latest, then others)
# GEMINI_MODEL=gemini-1.5-flash
```

Restart the dev server after adding or changing environment variables.

### Install & Run

```
npm install
npm run dev
```

Visit `http://localhost:3000` and either upload your CSV or press **Load sample dataset** to explore immediately.

### API Verification

- `POST /api/analyze` with `{ dataset, index }` returns summary, employee payload, and similar matches.
- `POST /api/generate` with `{ employee, analysis }` invokes Gemini (`gemini-1.5-flash`) and returns strategy text.

### Deployment

The app is ready for Vercel. Set `GOOGLE_API_KEY` in project environment variables and redeploy. No database required for the current flow. Optional future upgrades include caching analyses or storing strategy history in Neon/Postgres.
