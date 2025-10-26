import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../../constants/ApiConfig";
import { showSuccessToast, showErrorToast } from "../utils/ToastUtils";

interface MFALoginModalProps {
  visible: boolean;
  email: string;
  password: string;
  onSuccess: (userData: any) => void;
  onCancel: () => void;
}

const MFALoginModal: React.FC<MFALoginModalProps> = ({
  visible,
  email,
  password,
  onSuccess,
  onCancel,
}) => {
  const [totpCode, setTotpCode] = useState<string>("");
  const [backupCode, setBackupCode] = useState<string>("");
  const [useBackupCode, setUseBackupCode] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const handleMFALogin = async () => {
    if (!useBackupCode && (!totpCode || totpCode.length !== 6)) {
      showErrorToast("Please enter a valid 6-digit code");
      return;
    }

    if (useBackupCode && (!backupCode || backupCode.length < 6)) {
      showErrorToast("Please enter a valid backup code");
      return;
    }

    try {
      setLoading(true);

      const requestBody: any = {
        email,
        password,
      };

      if (useBackupCode) {
        requestBody.backup_code = backupCode;
      } else {
        requestBody.totp_code = totpCode;
      }

      const response = await fetch(`${API_URL}/users/login-mfa/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Store token and user data
        await AsyncStorage.setItem("token", data.token);
        await AsyncStorage.setItem("user", JSON.stringify(data.user));

        showSuccessToast("Login successful!");
        onSuccess(data);
      } else {
        showErrorToast(data.error || "Authentication failed");
      }
    } catch (error) {
      showErrorToast("Network error occurred");
    } finally {
      setLoading(false);
    }
  };

  const resetModal = () => {
    setTotpCode("");
    setBackupCode("");
    setUseBackupCode(false);
  };

  const handleCancel = () => {
    resetModal();
    onCancel();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Two-Factor Authentication</Text>
            <TouchableOpacity onPress={handleCancel} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <Text style={styles.description}>
            Enter your {useBackupCode ? "backup code" : "authenticator code"} to
            complete login
          </Text>

          {!useBackupCode ? (
            <TextInput
              style={styles.codeInput}
              value={totpCode}
              onChangeText={setTotpCode}
              placeholder="Enter 6-digit code"
              keyboardType="numeric"
              maxLength={6}
              autoFocus
            />
          ) : (
            <TextInput
              style={styles.codeInput}
              value={backupCode}
              onChangeText={setBackupCode}
              placeholder="Enter backup code"
              autoCapitalize="characters"
              autoFocus
            />
          )}

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => {
              setUseBackupCode(!useBackupCode);
              setTotpCode("");
              setBackupCode("");
            }}
          >
            <Text style={styles.switchButtonText}>
              {useBackupCode
                ? "Use authenticator code instead"
                : "Use backup code instead"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.disabledButton]}
            onPress={handleMFALogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.loginButtonText}>Verify & Login</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    width: "90%",
    maxWidth: 400,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  closeButton: {
    padding: 4,
  },
  description: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },
  codeInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 15,
    fontSize: 18,
    textAlign: "center",
    marginBottom: 15,
    letterSpacing: 2,
  },
  switchButton: {
    marginBottom: 20,
  },
  switchButtonText: {
    color: "#007AFF",
    fontSize: 14,
    textAlign: "center",
    textDecorationLine: "underline",
  },
  loginButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  loginButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  cancelButton: {
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: "#666",
    fontSize: 16,
    textAlign: "center",
  },
  disabledButton: {
    opacity: 0.6,
  },
});

export default MFALoginModal;
