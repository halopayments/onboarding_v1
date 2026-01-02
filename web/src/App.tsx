import { Routes, Route, Navigate } from "react-router-dom";
import MerchantForm from "./pages/MerchantForm";
import Success from "./pages/success";
import ScrollToTop from "./components/ScrollToTop";

export default function App() {
  return (
    <>
      <ScrollToTop />
    <Routes>
      <Route path="/" element={<MerchantForm />} />
      <Route path="/success" element={<Success />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
 </>
  );
}