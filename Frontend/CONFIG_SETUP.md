# API Configuration Setup

This project uses environment variables to securely manage API endpoints and configuration. **Never commit actual IP addresses or sensitive URLs to version control.**

## Quick Setup

1. **Copy the environment template:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` file with your actual configuration:**
   ```bash
   # Your Django backend URL
   EXPO_PUBLIC_API_URL=http://YOUR_ACTUAL_IP:8000
   
   # Your Ollama AI service URL
   EXPO_PUBLIC_OLLAMA_API_URL=http://YOUR_ACTUAL_IP:11434
   
   # Environment type
   EXPO_PUBLIC_ENVIRONMENT=development
   
   # Debug mode
   EXPO_PUBLIC_DEBUG=true
   ```

## Environment Examples

### For Development on Real Devices
```bash
# Example - replace with your actual local IP
EXPO_PUBLIC_API_URL=http://192.168.1.100:8000
EXPO_PUBLIC_OLLAMA_API_URL=http://192.168.1.100:11434
```

### For Production
```bash
EXPO_PUBLIC_API_URL=https://your-production-domain.com/api
EXPO_PUBLIC_OLLAMA_API_URL=https://your-ollama-service.com
EXPO_PUBLIC_ENVIRONMENT=production
EXPO_PUBLIC_DEBUG=false
```

## Finding Your Local IP Address

### Windows
```cmd
ipconfig
```
Look for "IPv4 Address" under your active network adapter.

### macOS/Linux
```bash
ifconfig | grep inet
# or
ip addr show
```

### Alternative Method
- On Windows: Settings > Network & Internet > Status > Properties
- On macOS: System Preferences > Network
- On Linux: Network settings in your distribution's system settings

## Security Notes

- ✅ `.env` files are automatically ignored by git
- ✅ Use `.env.example` as a template (this can be committed)
- ✅ The app will fall back to localhost for emulators/simulators if no environment variables are set
- ❌ **Never commit files containing actual IP addresses or sensitive URLs**
- ❌ **Never share environment files in public repositories**

## Troubleshooting

### App can't connect to backend
1. Check that your backend is running
2. Verify your IP address in the `.env` file
3. Ensure your device and computer are on the same network
4. Check firewall settings on your computer

### Environment variables not loading
1. Restart the Expo development server
2. Clear Expo cache: `expo start -c`
3. Make sure your `.env` file is in the Frontend directory
4. Verify environment variable names start with `EXPO_PUBLIC_`

## Platform Behavior

- **Android Emulator**: Uses `10.0.2.2` to access host machine
- **iOS Simulator**: Uses `localhost`
- **Web**: Uses environment variables or defaults to `localhost`
- **Real Devices**: Uses configured environment variables from `.env` file
