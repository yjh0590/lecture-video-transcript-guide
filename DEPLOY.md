# GitHub Pages 배포 방법

## 1. GitHub 저장소 만들기

1. GitHub에서 새 저장소를 만듭니다.
2. 저장소 이름은 `lecture-video-transcript-guide-web`을 권장합니다.
3. 이 폴더의 파일을 모두 저장소에 올립니다. `.github` 폴더도 반드시 포함해야 합니다.
4. 기본 브랜치는 `main`을 사용합니다.

## 2. 자동 배포 켜기

1. 저장소의 `Settings`를 엽니다.
2. 왼쪽 메뉴에서 `Pages`를 선택합니다.
3. `Build and deployment`의 Source를 `GitHub Actions`로 설정합니다.
4. 저장소의 `Actions` 화면에서 배포가 완료될 때까지 기다립니다.

`main` 브랜치가 수정될 때마다 웹사이트가 자동으로 다시 배포됩니다.

## 3. study.oddz.click 연결하기

Namecheap의 `Advanced DNS`에서 아래 레코드를 추가합니다.

| Type | Host | Value | TTL |
|---|---|---|---|
| CNAME Record | `study` | `GitHub아이디.github.io` | Automatic |

`GitHub아이디`는 실제 GitHub 사용자 이름으로 바꿔야 합니다.

그다음 GitHub 저장소의 `Settings → Pages → Custom domain`에 `study.oddz.click`을 입력합니다. DNS 확인과 HTTPS 인증서 발급에는 시간이 걸릴 수 있습니다. 연결이 완료되면 `Enforce HTTPS`를 켭니다.

## 4. Windows 앱 다운로드 연결

현재 웹사이트의 `Windows 앱 안내`는 설명창으로 되어 있습니다. 앱을 GitHub Releases에 올린 뒤 `src/main.js`의 안내창을 실제 다운로드 버튼으로 바꾸면 됩니다.
