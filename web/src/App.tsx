import { Routes, Route, Navigate } from "react-router-dom";
import MerchantForm from "./pages/MerchantForm";
import Success from "./pages/success";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MerchantForm />} />
      <Route path="/success" element={<Success />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
