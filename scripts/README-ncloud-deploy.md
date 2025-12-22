# ncloud 배포 스크립트 사용 가이드

이 스크립트는 ncloud Object Storage에 빌드된 파일을 업로드하고 Global Edge 캐시를 무효화합니다.

## 주요 특징

- **S3 API v2006-03-01 사용**: Object Storage에 PutObject API로 직접 업로드
- **Global Edge Purge**: index.html만 purge하여 효율적인 캐시 관리
- **캐시 버스팅 최적화**: CSS/JS 파일은 해시가 포함되어 자동으로 새 파일명을 사용하므로 purge 불필요

## 설치

```bash
npm install
```

`tsx` 패키지가 자동으로 설치됩니다.

## 환경 변수 설정

다음 환경 변수들을 설정해야 합니다:

### 필수 환경 변수

- `NCLOUD_ACCESS_KEY`: ncloud Access Key ID
- `NCLOUD_SECRET_KEY`: ncloud Secret Key
- `NCLOUD_BUCKET`: Object Storage 버킷 이름
- `NCLOUD_EDGE_ID`: Global Edge 엣지 ID

### 선택 환경 변수

- `NCLOUD_ENDPOINT`: Object Storage 엔드포인트 (기본값: `kr.object.ncloudstorage.com`)
- `NCLOUD_REGION`: 리전 (기본값: `KR`)

## 사용법

### 1. 빌드 후 배포

```bash
npm run build:deploy:ncloud
```

이 명령어는 빌드와 배포를 순차적으로 실행합니다.

### 2. 배포만 실행

이미 빌드된 파일이 있는 경우:

```bash
npm run deploy:ncloud
```

## 환경 변수 설정 방법

### 방법 1: .env 파일 사용 (권장)

프로젝트 루트에 `.env` 파일을 생성하고 환경 변수를 설정합니다:

```env
NCLOUD_ACCESS_KEY=your_access_key
NCLOUD_SECRET_KEY=your_secret_key
NCLOUD_BUCKET=your_bucket_name
NCLOUD_EDGE_ID=your_edge_id
NCLOUD_ENDPOINT=kr.object.ncloudstorage.com
NCLOUD_REGION=KR
```

그리고 `package.json`의 스크립트를 다음과 같이 수정하세요:

```json
"deploy:ncloud": "dotenv -e .env -- tsx scripts/deploy-ncloud.ts"
```

이 경우 `dotenv-cli` 패키지를 설치해야 합니다:

```bash
npm install --save-dev dotenv-cli
```

### 방법 2: 환경 변수 직접 설정

```bash
export NCLOUD_ACCESS_KEY=your_access_key
export NCLOUD_SECRET_KEY=your_secret_key
export NCLOUD_BUCKET=your_bucket_name
export NCLOUD_EDGE_PROFILE_ID=your_edge_profile_id
npm run deploy:ncloud
```

### 방법 3: CI/CD 환경에서

GitHub Actions 예시:

```yaml
- name: Deploy to ncloud
  env:
    NCLOUD_ACCESS_KEY: ${{ secrets.NCLOUD_ACCESS_KEY }}
    NCLOUD_SECRET_KEY: ${{ secrets.NCLOUD_SECRET_KEY }}
    NCLOUD_BUCKET: ${{ secrets.NCLOUD_BUCKET }}
    NCLOUD_EDGE_ID: ${{ secrets.NCLOUD_EDGE_ID }}
  run: npm run build:deploy:ncloud
```

## 동작 방식

1. **파일 검색**: `dist` 디렉토리 내의 모든 파일을 재귀적으로 검색합니다.
2. **파일 업로드**: 각 파일을 ncloud Object Storage에 업로드합니다.
   - S3 API v2006-03-01 PutObject를 사용합니다.
   - AWS Signature V4 방식으로 인증합니다.
   - 참고: [PutObject API 문서](https://api.ncloud-docs.com/docs/storage-objectstorage-putobject)
3. **Global Edge Purge**: `index.html`만 purge합니다.
   - CSS/JS 파일은 해시가 포함되어 있어 새 파일명을 사용하므로 purge 불필요
   - 참고: [Global Edge Purge API 문서](https://api.ncloud-docs.com/docs/purge-request)

## 캐시 전략

### index.html
- 항상 같은 경로 (`index.html`)
- 내용이 변경되면 파일명은 동일하지만 참조하는 CSS/JS 파일명이 변경됨
- **따라서 index.html만 purge하면 됨**

### CSS/JS/Assets 파일
- 내용이 변경되면 해시가 포함된 새 파일명 생성 (예: `index-IiflOtt4.js` → `index-XXXXX.js`)
- 새 파일명으로 요청이 들어오므로 이전 캐시는 영향 없음
- **따라서 purge 불필요**

## 문제 해결

### 서명 오류가 발생하는 경우

ncloud Object Storage는 AWS S3와 호환되지만, 서명 방식이 약간 다를 수 있습니다. 
필요한 경우 `scripts/deploy-ncloud.ts`의 `createS3Signature` 함수를 수정하세요.

### Global Edge Purge가 실패하는 경우

- Global Edge 엣지 ID가 올바른지 확인하세요.
- API Gateway 서명이 올바른지 확인하세요.
- ncloud 콘솔에서 API 호출 권한을 확인하세요.
- Purge 경로가 올바른지 확인하세요 (예: `/index.html`)

### 파일 업로드가 실패하는 경우

- 버킷 이름이 올바른지 확인하세요.
- Access Key와 Secret Key가 올바른지 확인하세요.
- 버킷에 대한 쓰기 권한이 있는지 확인하세요.

## 참고 문서

- [ncloud Object Storage PutObject API](https://api.ncloud-docs.com/docs/storage-objectstorage-putobject)
- [Global Edge 개요](https://api.ncloud-docs.com/docs/edge-overview)
- [Global Edge Purge 요청 API](https://api.ncloud-docs.com/docs/purge-request)
