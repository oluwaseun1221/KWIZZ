// Where the backend (FastAPI) lives.
//  - Locally this falls back to your own computer.
//  - When deployed, set REACT_APP_API_URL (e.g. in Vercel) to your hosted
//    backend address, such as https://kwizz-api.onrender.com
export const API_URL = (
  process.env.REACT_APP_API_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");
