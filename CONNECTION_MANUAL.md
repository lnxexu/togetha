## Togetha — App <-> Backend Connection Manual

This document explains how to run the backend on your laptop and connect a real Android device (APK) to it. It covers the minimum changes you need to make in the frontend (`Frontend/constants/EnvironmentConfig.ts`), how to make your laptop reachable on the local network (firewall/routing), options to build an APK, and verification/troubleshooting steps.

Note: This guide assumes a development setup. Do not expose development servers or credentials to the public internet without proper security (HTTPS, auth, reverse proxy).

---

## Overview (what we'll do)

- Run Django backend on your laptop, binding to all interfaces.
- Make sure the device and laptop are on the same local network (Wi‑Fi) or use a tunnelling tool (ngrok) or USB + adb reverse.
- Update `Frontend/constants/EnvironmentConfig.ts` to point the app to your laptop IP (or public ngrok URL).
- Build an APK (EAS or Gradle) and install it on your Android device.

## 1) Requirements

- Laptop: Windows (you're on PowerShell). Python 3.10+ recommended.
- Android device with USB debugging (if using adb) or same Wi‑Fi network as the laptop.
- Node/npm installed for the frontend build (project already has `package.json`).
- Optional: `eas-cli` (for Expo EAS builds) or Android Studio (for Gradle builds).

## 2) Find your laptop's local IP address

Open PowerShell and run:

```powershell
ipconfig | Select-String 'IPv4'
```

Look for the `IPv4 Address` for the adapter connected to your Wi‑Fi. It will look like `192.168.x.y` or `10.0.x.y`.

Call that value <LAPTOP_IP> for the rest of the steps.

## 3) Backend (Django) — run and expose on the network

1. Open a PowerShell terminal, cd into the `Backend` folder.

2. Create a virtual environment and install dependencies:

```powershell
cd Backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

If PowerShell blocks script execution, you may need to allow the current user to run scripts (run as Administrator if required):

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

3. Run migrations and start the development server bound to 0.0.0.0 so other devices on the LAN can reach it:

```powershell
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

This will make Django listen on port 8000 on every interface. If you prefer another port, replace `8000` consistently in the steps below.

4. Ensure `ALLOWED_HOSTS` and CORS allow your device. By default `Backend/server/settings.py` has `ALLOWED_HOSTS` set to `*` and `CORS_ALLOW_ALL_ORIGINS = DEBUG` which will allow connections in development. If you hardened settings, add `<LAPTOP_IP>` to `ALLOWED_HOSTS` and `CORS_ALLOWED_ORIGINS` or set `CORS_ALLOW_ALL_ORIGINS=True` temporarily during development.

Example minimal change (when using `.env` instead of hardcoded):

```text
ALLOWED_HOSTS=localhost,127.0.0.1,<LAPTOP_IP>
CORS_ALLOWED_ORIGINS=http://<LAPTOP_IP>:8000
```

## 4) Windows Firewall — allow incoming traffic to the port

To let your Android device reach the laptop's port, add a firewall rule on Windows. In an elevated PowerShell (Run as Administrator) run:

```powershell
New-NetFirewallRule -DisplayName "Togetha Django 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

If you're also using an Ollama model server at port 11434, allow that port too:

```powershell
New-NetFirewallRule -DisplayName "Ollama 11434" -Direction Inbound -Protocol TCP -LocalPort 11434 -Action Allow
```

If you prefer the GUI: Windows Security -> Firewall & network protection -> Advanced settings -> Inbound Rules -> New Rule -> Port -> TCP -> 8000 -> Allow.

## 5) Edit the frontend to point to your laptop

Open `Frontend/constants/EnvironmentConfig.ts` and change the `DEFAULT_CONFIG.apiUrl` (and `ollamaApiUrl` as needed) to use your laptop IP. Example:

```ts
// Frontend/constants/EnvironmentConfig.ts
export const DEFAULT_CONFIG: EnvironmentConfig = {
  apiUrl: 'http://<LAPTOP_IP>:8000/',
  ollamaApiUrl: 'http://<LAPTOP_IP>:11434/',
  environment: 'development',
  debug: true,
};
```

Replace `<LAPTOP_IP>` with the value obtained earlier.

Notes:
- If you are building the APK for production and don't want to recompile for each IP change, consider using a runtime config (e.g., `react-native-config`, reading a remote config file, or using a placeholder that the app reads from device storage). For development, editing this file before building is the simplest approach.

## 6) Build an APK (two common ways)

Option A — EAS (Expo Application Services) build (recommended if using Expo/EAS):

- Install EAS CLI (if not installed):

```powershell
npm install -g eas-cli
eas login
```

- Make sure `eas.json` in the `Frontend` folder is configured for the profile you want (preview/production). Then run from the `Frontend` folder:

```powershell
cd ..\Frontend
eas build -p android --profile preview
```

- Follow EAS prompts for credentials. After the build completes, download the APK/AAB from the EAS dashboard and install it on your device.

Option B — Gradle (Android Studio or command line):

- Open `Frontend/android` in Android Studio and produce a signed APK (Build > Generate Signed Bundle / APK). This is the GUI path and recommended if you need to sign the app.

- Or build via command line (works for a bare React Native app). From `Frontend\android` run:

```powershell
cd Frontend\android
.\gradlew assembleRelease
```

- The release APK will typically be at `app\build\outputs\apk\release\app-release.apk`.

Install the APK to your device (USB with adb) or copy the file and install manually:

```powershell
adb install -r path\to\app-release.apk
```

If you want to test quickly without building a release APK, you can run a debug build to device from Android Studio or use `expo run:android` (if this project supports it).

Detailed steps for each route

EAS (Expo) quick steps (if the project is an Expo-managed workflow):

- Ensure your `package.json` and `app.json` are configured and that the project is using Expo or EAS Build. From the `Frontend` folder:

```powershell
cd Frontend
npm install
eas login   # interactive
eas build -p android --profile preview
```

- If you want a local APK for debugging (no release signing required), use `eas build --local` after installing the local build dependencies per EAS docs.

Gradle / Android Studio steps (bare React Native or full native build):

1. Install Android Studio and the Android SDK. Open the `android` folder in Android Studio and let it sync.
2. Connect your device via USB and enable USB debugging.
3. For a debug install run (from `Frontend` root):

```powershell
npx react-native run-android
```

This builds and installs a debug APK to the device.

4. For a signed release APK (recommended for distribution):
  - In Android Studio: Build > Generate Signed Bundle / APK -> follow prompts to create a keystore and sign the APK.
  - Or via CLI: configure `keystore.properties` and run `cd android; .\gradlew assembleRelease`.

After installation, open the app and test API calls.

## 7) Alternatives for connecting the device

- USB + adb reverse (useful for development with a USB-connected device):

  - If the app points to `http://localhost:8000/` and you have `adb` and a USB-connected device, run:

    ```powershell
    adb devices
    adb reverse tcp:8000 tcp:8000
    ```

  - This forwards traffic from the device's localhost:8000 to your laptop's localhost:8000. After `adb reverse` you can use `http://localhost:8000/` in the app.

  - Note: `adb reverse` only works for devices connected by USB and not all Android versions/ROMs behave identically.

- Tunnelling with ngrok (if device is on a different network):

  - Install ngrok and run:

    ```powershell
    ngrok http 8000
    ```

  - ngrok will print a public HTTPS URL like `https://abcd1234.ngrok.io`. Use that URL as `apiUrl` in `EnvironmentConfig.ts` (must be an `https` URL). Also add the ngrok host to `CSRF_TRUSTED_ORIGINS` and `CORS_ALLOWED_ORIGINS` in `Backend/server/settings.py` or your `.env`.

## 8) Verify connectivity

- From your laptop (Backend running):

```powershell
curl http://127.0.0.1:8000/  # server reachable locally
```

- From the Android device's browser (or the app):

Open `http://<LAPTOP_IP>:8000/` (or the ngrok URL). You should see the Django default response or a configured homepage.

- Use the app and check logs (adb logcat) if things fail:

```powershell
adb logcat -s ReactNativeJS *:S
```

Or capture device network requests (Charles Proxy, Wireshark) if needed.

## 9) Common troubleshooting

- Device can't reach laptop:
  - Ensure both are on the same subnet (same Wi‑Fi). Mobile data vs Wi‑Fi will not work.
  - Check Windows Firewall rules and router isolation (some guest Wi‑Fi networks block client-to-client communication).
  - Verify `ipconfig` still shows the same IP and that the app uses it.

- CORS / CSRF blocked:
  - Add the device origin to `CORS_ALLOWED_ORIGINS` or set `CORS_ALLOW_ALL_ORIGINS = True` for development.
  - For CSRF, add your origin to `CSRF_TRUSTED_ORIGINS` in `Backend/server/settings.py`.

- SSL required (https) when using secure features or third-party SDKs; use ngrok (HTTPS) or set up a reverse proxy with a valid certificate.

## 10) Security notes

- During development it's convenient to allow broad access. Do not leave `DEBUG=True` and `ALLOWED_HOSTS=['*']` in a publicly reachable environment.
- Use HTTPS and proper authentication for production builds.

## 11) Quick checklist (copyable)

1. Find laptop IP: `ipconfig | Select-String 'IPv4'`
2. Start backend on all interfaces: `python manage.py runserver 0.0.0.0:8000`
3. Add firewall rule for port 8000.
4. Edit `Frontend/constants/EnvironmentConfig.ts` -> `apiUrl='http://<LAPTOP_IP>:8000/'`.
5. Build APK (EAS or Gradle) and install.
6. Open device browser `http://<LAPTOP_IP>:8000/` to test.

---

If you'd like, I can:

- Edit `EnvironmentConfig.ts` to add a comment or helper to read the IP from an environment variable.
- Add a small script to quickly swap the API URL before building.
- Provide a step-by-step EAS or Android Studio guide tailored to your exact `eas.json`.

Tell me which of these you'd like me to do next.
