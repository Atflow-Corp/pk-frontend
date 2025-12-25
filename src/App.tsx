import { useEffect, useState, Suspense, lazy } from 'react';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import Footer from '@/components/ui/Footer';
import { api, tokenManager, userManager } from '@/lib/api';

// 동적 임포트로 컴포넌트들을 lazy loading
const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const TermsAgreement = lazy(() => import('./pages/TermsAgreement'));
const UserRegistration = lazy(() => import('./pages/UserRegistration'));
const ServiceTerms = lazy(() => import('./pages/ServiceTerms'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TDMReportPage = lazy(() => import('./components/TDMReportPage'));

const queryClient = new QueryClient();

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showTermsAgreement, setShowTermsAgreement] = useState(false);
  const [showUserRegistration, setShowUserRegistration] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const navigate = useNavigate();

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch (error) {
      console.error("로그아웃 API 호출 실패:", error);
    }
    setIsAuthenticated(false);
    setShowTermsAgreement(false);
    setShowUserRegistration(false);
    setPhoneNumber('');
    // 로그아웃 후 로그인 페이지로 리다이렉트
    navigate('/');
  };

  const handleShowTermsAgreement = () => {
    setShowTermsAgreement(true);
  };

  const handleBackFromTerms = () => {
    setShowTermsAgreement(false);
  };

  const handleTermsAgreed = () => {
    setShowTermsAgreement(false);
    setShowUserRegistration(true);
  };

  const handleBackFromRegistration = () => {
    setShowUserRegistration(false);
  };

  const handleRegistrationComplete = () => {
    setShowUserRegistration(false);
    // 회원가입 완료 후 자동으로 로그인 처리하여 서비스 홈으로 이동
    setIsAuthenticated(true);
    console.log("회원가입이 완료되었습니다. 서비스 홈으로 이동합니다.");
  };

  useEffect(() => {
    // 토큰 기반 인증 확인
    const isAuth = tokenManager.isAuthenticated();
    setIsAuthenticated(isAuth);
    
    // 토큰이 있는데 사용자 정보가 없으면 조회해서 저장
    if (isAuth && !userManager.hasUser()) {
      api.getUserInfo().catch((error) => {
        console.error("사용자 정보 조회 실패:", error);
        // 사용자 정보 조회 실패 시 토큰이 유효하지 않을 수 있으므로 로그아웃 처리
        tokenManager.remove();
        setIsAuthenticated(false);
      });
    }
  }, []);

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    }>
      <Routes>
        {/* 인증되지 않은 상태에서 접근 가능한 페이지들 */}
        <Route path="/terms" element={<ServiceTerms />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        
        {/* 인증된 상태에서만 접근 가능한 페이지들 */}
        {isAuthenticated ? (
          <>
            <Route path="/" element={<Index onLogout={handleLogout} />} />
            <Route path="/report" element={<TDMReportPage />} />
            <Route path="*" element={<NotFound />} />
          </>
        ) : (
          <>
            {/* 인증되지 않은 상태에서의 페이지들 */}
            {showUserRegistration ? (
              <Route path="*" element={<UserRegistration onBack={handleBackFromRegistration} onComplete={handleRegistrationComplete} initialPhoneNumber={phoneNumber} />} />
            ) : showTermsAgreement ? (
              <Route path="*" element={<TermsAgreement onBack={handleBackFromTerms} onAgree={handleTermsAgreed} />} />
            ) : (
              <Route path="*" element={<LoginPage onLogin={handleLogin} onShowTermsAgreement={handleShowTermsAgreement} onPhoneNumberSet={setPhoneNumber} />} />
            )}
          </>
        )}
      </Routes>
      <Footer />
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
