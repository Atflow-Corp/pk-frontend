import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from "sonner";
import Header from '@/components/ui/Header';
import Footer from '@/components/ui/Footer';
import { api } from '@/lib/api';

interface LoginPageProps {
  onLogin: () => void;
  onShowTermsAgreement: () => void;
  onPhoneNumberSet?: (phoneNumber: string) => void;
}

const LoginPage = ({ onLogin, onShowTermsAgreement, onPhoneNumberSet }: LoginPageProps) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isVerificationSent, setIsVerificationSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [verificationId, setVerificationId] = useState<string | undefined>();

  // 인증번호 전송 핸들러
  const handleSendVerification = async () => {
    if (!phoneNumber) {
      toast.error("휴대폰 번호를 입력해주세요.");
      return;
    }
    
    const phoneRegex = /^010\d{8}$/;
    if (!phoneRegex.test(phoneNumber)) {
      toast.error("올바른 휴대폰 번호 형식을 입력해주세요. (010으로 시작하는 11자리)");
      return;
    }

    setIsRequestingCode(true);
    try {
      const result = await api.requestCode(phoneNumber, 'login') as {
        id?: string;
        expiresIn?: number;
      };
      
      // verificationId가 응답에 포함되어 있으면 저장
      if (result.id) {
        setVerificationId(result.id);
      }
      
      setIsVerificationSent(true);
      toast.success("인증번호가 발송되었습니다.");
    } catch (error) {
      // 에러는 api 인터셉터에서 이미 처리됨
      console.error("인증번호 발송 실패:", error);
    } finally {
      setIsRequestingCode(false);
    }
  };

  // 로그인 핸들러
  const handleLogin = async () => {
    if (!verificationCode) {
      toast.error("인증번호를 입력해주세요.");
      return;
    }

    setIsLoggingIn(true);
    try {
      const result = await api.login(phoneNumber, verificationCode, verificationId) as {
        requiresTerms?: boolean;
        requiresDefaultInfo?: boolean;
        user?: unknown;
      };

      // 약관 동의 필요 여부 확인
      if (result.requiresTerms) {
        onPhoneNumberSet?.(phoneNumber);
        onShowTermsAgreement();
        return;
      }

      // 기본 정보 입력 필요 여부 확인
      if (result.requiresDefaultInfo) {
        onPhoneNumberSet?.(phoneNumber);
        onShowTermsAgreement();
        return;
      }

      // 로그인 성공
      toast.success("로그인되었습니다.");
      onLogin();
    } catch (error) {
      // 에러는 api 인터셉터에서 이미 처리됨
      console.error("로그인 실패:", error);
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-100 dark:bg-slate-900">
      <Header />
      <div className="flex flex-1 items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">TDM Friends</CardTitle>
            <CardDescription>Precision Medicine의 시작</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="text-center text-sm text-muted-foreground space-y-1">
                <p>초대받은 휴대폰 번호를 입력한 후 인증해주세요.</p>
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="휴대폰 번호 ('-' 제외)"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="flex-1 h-10"
                  />
                  <Button 
                    variant="outline" 
                    className="h-10 text-gray-700 border-gray-300 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-50 dark:border-gray-600 dark:hover:bg-slate-800 dark:active:bg-slate-700"
                    onClick={handleSendVerification}
                    disabled={isRequestingCode}
                  >
                    {isRequestingCode ? "전송 중..." : "인증번호 전송"}
                  </Button>
                </div>
                {isVerificationSent && (
                  <Input
                    type="text"
                    placeholder="인증번호를 입력하세요"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    className="h-10"
                    maxLength={6}
                  />
                )}
              </div>
              <Button 
                onClick={handleLogin} 
                className="w-full flex items-center gap-2"
                disabled={!isVerificationSent || !verificationCode || isLoggingIn}
              >
                {isLoggingIn ? "로그인 중..." : "로그인"}
              </Button>
              <div className="text-center space-y-2">
                <div className="text-xs text-muted-foreground pt-2 space-y-1">
                  <p>TDM Friends는 초대 기반으로 운영하고 있습니다.</p>
                  <p>사용에 관심이 있으신 분은 contact@pkfriend.co.kr로 문의주세요.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </div>
  );
};

export default LoginPage; 