#!/usr/bin/env node
/**
 * ncloud Object Storage 배포 및 Global Edge Purge 스크립트
 *
 * 사용법:
 *   npm run deploy:ncloud
 *
 * 환경 변수:
 *   NCLOUD_ACCESS_KEY - ncloud Access Key
 *   NCLOUD_SECRET_KEY - ncloud Secret Key
 *   NCLOUD_BUCKET - Object Storage 버킷 이름
 *   NCLOUD_ENDPOINT - Object Storage 엔드포인트 (예: kr.object.ncloudstorage.com)
 *   NCLOUD_REGION - 리전 (예: KR)
 *   NCLOUD_EDGE_ID - Global Edge 엣지 ID
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, resolve } from "path";
import { createHash, createHmac } from "crypto";
import dotenv from "dotenv";

// .env 파일 로드
dotenv.config();

interface NcloudConfig {
  accessKey: string;
  secretKey: string;
  bucket: string;
  endpoint: string;
  region: string;
  edgeId: string;
}

interface UploadResult {
  path: string;
  success: boolean;
  error?: string;
}

/**
 * 환경 변수에서 설정 읽기
 */
function getConfig(): NcloudConfig {
  const accessKey = process.env.NCLOUD_ACCESS_KEY;
  const secretKey = process.env.NCLOUD_SECRET_KEY;
  const bucket = process.env.NCLOUD_BUCKET;
  const endpoint = process.env.NCLOUD_ENDPOINT || "kr.object.ncloudstorage.com";
  const region = process.env.NCLOUD_REGION || "KR";
  const edgeId = process.env.NCLOUD_EDGE_ID;

  if (!accessKey || !secretKey || !bucket || !edgeId) {
    throw new Error(
      "필수 환경 변수가 설정되지 않았습니다:\n" +
        "  NCLOUD_ACCESS_KEY\n" +
        "  NCLOUD_SECRET_KEY\n" +
        "  NCLOUD_BUCKET\n" +
        "  NCLOUD_EDGE_ID"
    );
  }

  return {
    accessKey,
    secretKey,
    bucket,
    endpoint,
    region,
    edgeId,
  };
}

/**
 * AWS Signature V4 스타일 서명 생성 (S3 API v2006-03-01)
 */
function createS3Signature(
  method: string,
  uri: string,
  headers: Record<string, string>,
  secretKey: string,
  region: string,
  accessKey: string
): string {
  const algorithm = "AWS4-HMAC-SHA256";
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate =
    now
      .toISOString()
      .replace(/[:-]|\.\d{3}/g, "")
      .slice(0, 15) + "Z";

  // 1. Canonical Request 생성
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((key) => `${key.toLowerCase()}:${headers[key].trim()}\n`)
    .join("");

  const signedHeaders = Object.keys(headers)
    .sort()
    .map((key) => key.toLowerCase())
    .join(";");

  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    method,
    uri,
    "", // query string
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  // 2. String to Sign 생성
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    createHash("sha256").update(canonicalRequest).digest("hex"),
  ].join("\n");

  // 3. Signature 생성
  const kDate = createHmac("sha256", `AWS4${secretKey}`)
    .update(dateStamp)
    .digest();
  const kRegion = createHmac("sha256", kDate).update(region).digest();
  const kService = createHmac("sha256", kRegion).update("s3").digest();
  const kSigning = createHmac("sha256", kService)
    .update("aws4_request")
    .digest();
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");

  return `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

/**
 * Object Storage에 파일 업로드 (S3 API v2006-03-01 PutObject)
 */
async function uploadFile(
  config: NcloudConfig,
  filePath: string,
  objectKey: string
): Promise<UploadResult> {
  try {
    const fileContent = readFileSync(filePath);
    const method = "PUT";
    const uri = `/${config.bucket}/${objectKey}`;
    const url = `https://${config.endpoint}${uri}`;

    const now = new Date();
    const amzDate =
      now
        .toISOString()
        .replace(/[:-]|\.\d{3}/g, "")
        .slice(0, 15) + "Z";

    // Content-Type 추정
    const ext = objectKey.split(".").pop()?.toLowerCase();
    const contentTypeMap: Record<string, string> = {
      html: "text/html",
      css: "text/css",
      js: "application/javascript",
      json: "application/json",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      svg: "image/svg+xml",
      ico: "image/x-icon",
      woff: "font/woff",
      woff2: "font/woff2",
      ttf: "font/ttf",
      eot: "application/vnd.ms-fontobject",
    };
    const contentType = contentTypeMap[ext || ""] || "application/octet-stream";

    const headers: Record<string, string> = {
      Host: config.endpoint,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
      "Content-Type": contentType,
      "Content-Length": fileContent.length.toString(),
    };

    const authorization = createS3Signature(
      method,
      uri,
      headers,
      config.secretKey,
      config.region,
      config.accessKey
    );

    const response = await fetch(url, {
      method,
      headers: {
        ...headers,
        Authorization: authorization,
      },
      body: fileContent as unknown as BodyInit,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        path: filePath,
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    return {
      path: filePath,
      success: true,
    };
  } catch (error) {
    return {
      path: filePath,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 디렉토리 내 모든 파일 재귀적으로 찾기
 */
function getAllFiles(dirPath: string): string[] {
  const files: string[] = [];
  const items = readdirSync(dirPath);

  for (const item of items) {
    const fullPath = join(dirPath, item);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Global Edge Purge API 호출
 * 참고: https://api.ncloud-docs.com/docs/purge-request
 */
async function purgeEdge(
  config: NcloudConfig,
  targetPath: string
): Promise<boolean> {
  try {
    const apiUrl = "https://edge.apigw.ntruss.com/api/v1/purge";
    const now = new Date();
    const timestamp = now.getTime().toString();

    // 요청 바디 구성
    // purgeType: "URL" - 개별 파일 단위 퍼지 (와일드카드 사용 불가)
    // purgeTarget: Array - /로 시작하는 경로 배열
    const requestBody = {
      edgeId: parseInt(config.edgeId, 10), // Long 타입이므로 숫자로 변환
      purgeType: "URL",
      purgeTarget: [targetPath], // 배열로 전달
    };

    // API Gateway 서명 생성
    // 참고: https://api.ncloud-docs.com/docs/edge-overview
    const method = "POST";
    const uri = "/api/v1/purge";
    const bodyString = JSON.stringify(requestBody);

    const headers: Record<string, string> = {
      "x-ncp-iam-access-key": config.accessKey,
      "x-ncp-apigw-timestamp": timestamp,
      "Content-Type": "application/json",
    };

    // String to Sign 생성
    // 형식: method + space + url + newLine + timestamp + newLine + accessKey
    const stringToSign = [
      method,
      " ", // space
      uri,
      "\n", // newLine
      timestamp,
      "\n", // newLine
      config.accessKey,
    ].join("");

    const signature = createHmac("sha256", config.secretKey)
      .update(stringToSign)
      .digest("base64");

    headers["x-ncp-apigw-signature-v2"] = signature;

    const response = await fetch(apiUrl, {
      method,
      headers,
      body: bodyString,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Global Edge Purge 실패: HTTP ${response.status}: ${errorText}`
      );
      return false;
    }

    const result = await response.json();

    // purgeRequestId 추출
    if (result.code === "0000" && result.result && result.result.length > 0) {
      const purgeRequestId = result.result[0];
      console.log(`Global Edge Purge 요청 완료 (ID: ${purgeRequestId})`);

      // purge 완료까지 대기하고 최종 결과 출력
      const success = await waitForPurgeCompletion(
        config,
        purgeRequestId.toString()
      );
      return success;
    } else {
      console.log("Global Edge Purge 응답:", JSON.stringify(result, null, 2));
      return false;
    }
  } catch (error) {
    console.error("Global Edge Purge 오류:", error);
    return false;
  }
}

/**
 * Global Edge Purge 이력 조회
 * 참고: https://api.ncloud-docs.com/docs/purge-request-info
 */
async function getPurgeStatus(
  config: NcloudConfig,
  purgeRequestId: string
): Promise<{ success: boolean; status: string }> {
  try {
    const apiUrl = `https://edge.apigw.ntruss.com/api/v1/purge/${purgeRequestId}`;
    const now = new Date();
    const timestamp = now.getTime().toString();

    // API Gateway 서명 생성
    const method = "GET";
    const uri = `/api/v1/purge/${purgeRequestId}`;

    const headers: Record<string, string> = {
      "x-ncp-iam-access-key": config.accessKey,
      "x-ncp-apigw-timestamp": timestamp,
    };

    // String to Sign 생성
    // 형식: method + space + url + newLine + timestamp + newLine + accessKey
    const stringToSign = [
      method,
      " ", // space
      uri,
      "\n", // newLine
      timestamp,
      "\n", // newLine
      config.accessKey,
    ].join("");

    const signature = createHmac("sha256", config.secretKey)
      .update(stringToSign)
      .digest("base64");

    headers["x-ncp-apigw-signature-v2"] = signature;

    const response = await fetch(apiUrl, {
      method,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Purge 이력 조회 실패: HTTP ${response.status}: ${errorText}`
      );
      return { success: false, status: "UNKNOWN" };
    }

    const result = await response.json();
    if (result.code === "0000" && result.result) {
      return {
        success: true,
        status: result.result.status,
      };
    } else {
      console.log("Purge 이력 조회 응답:", JSON.stringify(result, null, 2));
      return { success: false, status: "UNKNOWN" };
    }
  } catch (error) {
    console.error("Purge 이력 조회 오류:", error);
    return { success: false, status: "UNKNOWN" };
  }
}

/**
 * Purge 상태를 SUCCESS 또는 FAILURE가 될 때까지 대기하고 최종 결과 출력
 */
async function waitForPurgeCompletion(
  config: NcloudConfig,
  purgeRequestId: string
): Promise<boolean> {
  const maxAttempts = 60; // 최대 60번 시도 (약 5분)
  const delayMs = 5000; // 5초마다 확인

  console.log(`\n⏳ Purge 완료 대기 중... (ID: ${purgeRequestId})`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 조금 대기 후 상태 확인
    if (attempt > 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const statusResult = await getPurgeStatus(config, purgeRequestId);

    if (!statusResult.success) {
      console.error("Purge 상태 조회 실패");
      return false;
    }

    const status = statusResult.status;

    if (status === "SUCCESS" || status === "FAILURE") {
      // 최종 상태 조회 및 출력
      await printPurgeStatus(config, purgeRequestId);
      return status === "SUCCESS";
    }

    // 진행 중인 상태 표시
    if (attempt % 3 === 0) {
      // 3번마다 한 번씩 진행 상태 표시
      process.stdout.write(`   진행 중... (${attempt}/${maxAttempts})\r`);
    }
  }

  console.error("\n❌ Purge 완료 대기 시간 초과");
  await printPurgeStatus(config, purgeRequestId);
  return false;
}

/**
 * Purge 상태 정보 출력
 */
async function printPurgeStatus(
  config: NcloudConfig,
  purgeRequestId: string
): Promise<void> {
  try {
    const apiUrl = `https://edge.apigw.ntruss.com/api/v1/purge/${purgeRequestId}`;
    const now = new Date();
    const timestamp = now.getTime().toString();

    const method = "GET";
    const uri = `/api/v1/purge/${purgeRequestId}`;

    const headers: Record<string, string> = {
      "x-ncp-iam-access-key": config.accessKey,
      "x-ncp-apigw-timestamp": timestamp,
    };

    const stringToSign = [
      method,
      " ",
      uri,
      "\n",
      timestamp,
      "\n",
      config.accessKey,
    ].join("");

    const signature = createHmac("sha256", config.secretKey)
      .update(stringToSign)
      .digest("base64");

    headers["x-ncp-apigw-signature-v2"] = signature;

    const response = await fetch(apiUrl, {
      method,
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Purge 상태 조회 실패: HTTP ${response.status}: ${errorText}`
      );
      return;
    }

    const result = await response.json();
    if (result.code === "0000" && result.result) {
      const statusInfo = result.result;
      console.log(`\n📊 Purge 최종 상태: ${statusInfo.status}`);
      console.log(`   요청 일시: ${statusInfo.requestDateTime}`);
      console.log(
        `   대상: ${
          statusInfo.targetFileListString ||
          statusInfo.targetDirectory ||
          "전체"
        }`
      );
      console.log(`   Purge 유형: ${statusInfo.purgeType}`);

      if (statusInfo.status === "SUCCESS") {
        console.log("   ✅ Purge 완료");
      } else if (statusInfo.status === "FAILURE") {
        console.log("   ❌ Purge 실패");
      } else {
        console.log(`   ⏳ Purge 진행 중 (${statusInfo.status})`);
      }
    } else {
      console.log("Purge 상태 조회 응답:", JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error("Purge 상태 출력 오류:", error);
  }
}

/**
 * 메인 배포 함수
 */
async function deploy() {
  try {
    console.log("🚀 ncloud 배포 시작...\n");

    const config = getConfig();
    const distDir = resolve(process.cwd(), "dist");

    // dist 디렉토리 확인
    try {
      statSync(distDir);
    } catch {
      throw new Error(
        `dist 디렉토리를 찾을 수 없습니다. 먼저 'npm run build'를 실행하세요.`
      );
    }

    // 모든 파일 찾기
    console.log("📁 파일 검색 중...");
    const files = getAllFiles(distDir);
    console.log(`   ${files.length}개 파일 발견\n`);

    // 파일 업로드
    console.log("📤 파일 업로드 중...");
    const uploadResults: UploadResult[] = [];

    for (const filePath of files) {
      const relativePath = relative(distDir, filePath);
      const objectKey = relativePath;

      process.stdout.write(`   ${objectKey}... `);
      const result = await uploadFile(config, filePath, objectKey);
      uploadResults.push(result);

      if (result.success) {
        console.log("✓");
      } else {
        console.log(`✗ (${result.error})`);
      }
    }

    const successCount = uploadResults.filter((r) => r.success).length;
    const failCount = uploadResults.filter((r) => !r.success).length;

    console.log(
      `\n✅ 업로드 완료: ${successCount}개 성공, ${failCount}개 실패\n`
    );

    if (failCount > 0) {
      console.error("❌ 일부 파일 업로드에 실패했습니다.");
      process.exit(1);
    }

    // Global Edge Purge - index.html만
    const purgePath = "/index.html";

    console.log(`🔄 Global Edge 캐시 무효화 중... (${purgePath})`);
    const purgeSuccess = await purgeEdge(config, purgePath);

    if (purgeSuccess) {
      console.log("\n✅ 배포 완료!");
    } else {
      console.log(
        "\n⚠️  배포는 완료되었지만 Global Edge Purge에 실패했습니다."
      );
      process.exit(1);
    }
  } catch (error) {
    console.error(
      "\n❌ 배포 실패:",
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

// 스크립트 실행
deploy();
