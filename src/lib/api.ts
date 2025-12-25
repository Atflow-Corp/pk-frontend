import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
  AxiosResponse,
} from "axios";
import { toast } from "sonner";
import { toCamelCaseKeys, toSnakeCaseKeys } from "./caseConverter";

/**
 * API 베이스 URL
 */
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://b.tdmfriend.com/api";

/**
 * 토큰 저장 키
 */
const TOKEN_KEY = "tdmfriends:authToken";

/**
 * 사용자 정보 저장 키
 */
const USER_KEY = "tdmfriends:user";

/**
 * 사용자 정보 타입
 */
export interface UserInfo {
  id: number;
  name: string;
  phone: string;
  email?: string;
  organization?: {
    id: number;
    name: string;
  };
  organizationId?: number;
  medicalRole?: "doctor" | "nurse" | "other";
  termsAgreedAt?: string;
}

/**
 * 인증 토큰 관리
 */
export const tokenManager = {
  /**
   * 토큰 가져오기
   */
  get(): string | null {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },

  /**
   * 토큰 저장
   */
  set(token: string): void {
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // no-op
    }
  },

  /**
   * 토큰 제거
   */
  remove(): void {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      // no-op
    }
  },

  /**
   * 인증 여부 확인
   */
  isAuthenticated(): boolean {
    return this.get() !== null;
  },
};

/**
 * 사용자 정보 관리
 */
export const userManager = {
  /**
   * 사용자 정보 가져오기
   */
  get(): UserInfo | null {
    try {
      const raw = window.localStorage.getItem(USER_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as UserInfo;
    } catch {
      return null;
    }
  },

  /**
   * 사용자 정보 저장
   */
  set(user: UserInfo): void {
    try {
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      // no-op
    }
  },

  /**
   * 사용자 정보 제거
   */
  remove(): void {
    try {
      window.localStorage.removeItem(USER_KEY);
    } catch {
      // no-op
    }
  },

  /**
   * 사용자 정보가 있는지 확인
   */
  hasUser(): boolean {
    return this.get() !== null;
  },
};

/**
 * API 클라이언트 인스턴스 생성
 */
const createApiClient = (): AxiosInstance => {
  const axiosInstance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      "Content-Type": "application/json",
    },
  });

  // 요청 인터셉터: camelCase -> snake_case 변환 및 토큰 추가
  axiosInstance.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      // 토큰이 있으면 Authorization 헤더 추가
      const token = tokenManager.get();
      if (token && config.headers) {
        config.headers.Authorization = `Token ${token}`;
      }

      // 요청 데이터를 snake_case로 변환
      if (config.data && typeof config.data === "object") {
        config.data = toSnakeCaseKeys(config.data);
      }

      // URL 파라미터도 변환 (필요한 경우)
      if (config.params && typeof config.params === "object") {
        config.params = toSnakeCaseKeys(config.params);
      }

      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // 응답 인터셉터: snake_case -> camelCase 변환 및 에러 처리
  axiosInstance.interceptors.response.use(
    (response: AxiosResponse) => {
      // 응답 데이터를 camelCase로 변환
      if (response.data && typeof response.data === "object") {
        response.data = toCamelCaseKeys(response.data);
      }
      return response;
    },
    (error: AxiosError) => {
      const config = error.config as InternalAxiosRequestConfig & {
        _skipAuthRedirect?: boolean;
      };
      const url = config?.url || "";

      // 401 에러 처리 (로그인 엔드포인트는 제외)
      if (error.response?.status === 401 && !config?._skipAuthRedirect) {
        const isAuthEndpoint =
          url.includes("/auth/login") ||
          url.includes("/auth/request_code") ||
          url.includes("/auth/verify_phone") ||
          url.includes("/auth/check_phone");

        if (!isAuthEndpoint) {
          tokenManager.remove();
          // 로그인 페이지로 리다이렉트
          window.location.href = "/";
        }
      }

      // 에러 응답 처리 (2xx가 아니고 error/detail 필드가 있는 경우)
      if (error.response && error.response.status >= 400) {
        const errorData = error.response.data as Record<string, unknown>;
        const errorMessage =
          (errorData?.error as string) ||
          (errorData?.detail as string) ||
          (errorData?.message as string) ||
          "요청 처리 중 오류가 발생했습니다.";

        // 스넥바로 에러 표시
        toast.error(errorMessage);
      }

      return Promise.reject(error);
    }
  );

  return axiosInstance;
};

/**
 * Axios 인스턴스
 */
const axiosInstance = createApiClient();

/**
 * 통합 API 클라이언트
 * axios 메서드(get, post, patch, delete 등)와 커스텀 API 메서드를 모두 제공
 */
export const api = {
  // Axios 메서드들
  ...axiosInstance,

  /**
   * 인증번호 발송 요청
   */
  async requestCode(
    phone: string,
    type: "login" | "phone_change" | "phone_register" = "login"
  ) {
    const response = await axiosInstance.post("/auth/request_code/", {
      phone,
      type,
    });
    return response.data;
  },

  /**
   * 인증번호 확인
   */
  async verifyPhone(phone: string, code: string, verificationId?: string) {
    const response = await axiosInstance.post("/auth/verify_phone/", {
      phone,
      code,
      verification_id: verificationId,
    });
    return response.data;
  },

  /**
   * 로그인
   */
  async login(phone: string, code: string, verificationId?: string) {
    const response = await axiosInstance.post("/auth/login/", {
      phone,
      code,
      verification_id: verificationId,
    });

    // 로그인 성공 시 토큰 저장
    const token = response.data.token || response.data.accessToken;
    if (token) {
      tokenManager.set(token);
    }

    // 사용자 정보 저장
    if (response.data.user) {
      userManager.set(response.data.user as UserInfo);
    }

    return response.data;
  },

  /**
   * 전화번호 중복 체크
   */
  async checkPhone(phone: string) {
    const response = await axiosInstance.post("/auth/check_phone/", {
      phone,
    });
    return response.data;
  },

  /**
   * 로그아웃
   */
  async logout() {
    try {
      await axiosInstance.post("/auth/logout/");
    } catch (error) {
      // API 호출 실패해도 토큰은 제거
      console.error("로그아웃 API 호출 실패:", error);
    } finally {
      tokenManager.remove();
      userManager.remove();
    }
  },

  /**
   * 사용자 정보 조회
   */
  async getUserInfo() {
    const response = await axiosInstance.get("/user/info/");

    // 사용자 정보 저장
    if (response.data) {
      userManager.set(response.data as UserInfo);
    }

    return response.data;
  },

  /**
   * 사용자 정보 수정
   */
  async updateUserInfo(data: {
    name?: string;
    organizationId?: string;
    medicalRole?: "doctor" | "nurse" | "other";
  }) {
    const response = await axiosInstance.patch("/user/info/", data);

    // 사용자 정보 업데이트 (응답 전체를 저장)
    if (response.data) {
      userManager.set(response.data as UserInfo);
    }

    return response.data;
  },

  /**
   * 약관 동의
   */
  async agreeTerms() {
    const response = await axiosInstance.post("/user/agree_terms/");

    // 사용자 정보 업데이트 (응답 전체를 저장)
    if (response.data) {
      userManager.set(response.data as UserInfo);
    }

    return response.data;
  },

  /**
   * Organization 목록 조회
   */
  async getOrganizations() {
    const response = await axiosInstance.get("/organizations/");
    return response.data;
  },
} as AxiosInstance & {
  requestCode: (
    phone: string,
    type?: "login" | "phone_change" | "phone_register"
  ) => Promise<unknown>;
  verifyPhone: (
    phone: string,
    code: string,
    verificationId?: string
  ) => Promise<unknown>;
  login: (
    phone: string,
    code: string,
    verificationId?: string
  ) => Promise<unknown>;
  checkPhone: (phone: string) => Promise<unknown>;
  logout: () => Promise<void>;
  getUserInfo: () => Promise<unknown>;
  updateUserInfo: (data: {
    name?: string;
    organizationId?: string;
    medicalRole?: "doctor" | "nurse" | "other";
  }) => Promise<unknown>;
  agreeTerms: () => Promise<unknown>;
  getOrganizations: () => Promise<unknown>;
};
