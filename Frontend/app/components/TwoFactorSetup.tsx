import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  Image,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../../constants/ApiConfig";
import { showSuccessToast, showErrorToast } from "../utils/ToastUtils";

interface TwoFactorSetupProps {
  visible: boolean;
  onClose: () => void;
  onSetupComplete: () => void;
}

interface BackupCodesModalProps {
  visible: boolean;
  codes: string[];
  onClose: () => void;
}

const BackupCodesModal: React.FC<BackupCodesModalProps> = ({
  visible,
  codes,
  onClose,
}) => (
  <Modal visible={visible} animationType="slide" transparent>
    <View style={styles.modalOverlay}>
      <View style={styles.backupCodesContainer}>
        <Text style={styles.backupCodesTitle}>Backup Codes</Text>
        <Text style={styles.backupCodesSubtitle}>
          Save these codes in a safe place. You can use them to access your
          account if you lose your authenticator.
        </Text>

        <ScrollView style={styles.codesContainer}>
          {codes.map((code, index) => (
            <View key={index} style={styles.codeItem}>
              <Text style={styles.codeText}>{code}</Text>
            </View>
          ))}
        </ScrollView>

        <TouchableOpacity style={styles.gotItButton} onPress={onClose}>
          <Text style={styles.gotItButtonText}>I've Saved These Codes</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>
);

const TwoFactorSetup: React.FC<TwoFactorSetupProps> = ({
  visible,
  onClose,
  onSetupComplete,
}) => {
  const [step, setStep] = useState<"setup" | "verify">("setup");
  const [qrCode, setQrCode] = useState<string>("");
  const [manualKey, setManualKey] = useState<string>("");
  const [verificationCode, setVerificationCode] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState<boolean>(false);

  const setup2FA = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("token");

      const response = await fetch(`${API_URL}/users/setup-2fa/`, {
        method: "POST",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();

      if (response.ok) {
        setQrCode(data.qr_code);
        setManualKey(data.manual_entry_key);
        setStep("verify");
      } else {
        showErrorToast(data.error || "Failed to setup 2FA");
      }
    } catch (error) {
      showErrorToast("Network error occurred");
    } finally {
      setLoading(false);
    }
  };

  const verify2FA = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      showErrorToast("Please enter a valid 6-digit code");
      return;
    }

    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("token");

      const response = await fetch(`${API_URL}/users/verify-2fa-setup/`, {
        method: "POST",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          verification_code: verificationCode,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setBackupCodes(data.backup_codes);
        setShowBackupCodes(true);
        showSuccessToast("2FA enabled successfully!");
        onSetupComplete();
      } else {
        showErrorToast(data.error || "Failed to verify 2FA");
      }
    } catch (error) {
      showErrorToast("Network error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleBackupCodesClose = () => {
    setShowBackupCodes(false);
    onClose();
    // Reset state
    setStep("setup");
    setQrCode("");
    setManualKey("");
    setVerificationCode("");
    setBackupCodes([]);
  };

  useEffect(() => {
    if (visible && step === "setup") {
      setup2FA();
    }
  }, [visible]);

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.header}>
              <Text style={styles.title}>Setup Two-Factor Authentication</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.content}>
              {step === "setup" && (
                <View style={styles.setupStep}>
                  <Text style={styles.stepTitle}>Step 1: Scan QR Code</Text>
                  <Text style={styles.stepDescription}>
                    Use your authenticator app (Google Authenticator, Authy,
                    etc.) to scan this QR code:
                  </Text>

                  {qrCode ? (
                    <View style={styles.qrContainer}>
                      <Image source={{ uri: qrCode }} style={styles.qrCode} />
                    </View>
                  ) : (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="large" color="#007AFF" />
                      <Text>Generating QR code...</Text>
                    </View>
                  )}

                  {manualKey && (
                    <View style={styles.manualEntry}>
                      <Text style={styles.manualTitle}>
                        Can't scan? Enter this key manually:
                      </Text>
                      <Text style={styles.manualKey}>{manualKey}</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.nextButton}
                    onPress={() => setStep("verify")}
                    disabled={!qrCode}
                  >
                    <Text style={styles.nextButtonText}>Next</Text>
                  </TouchableOpacity>
                </View>
              )}

              {step === "verify" && (
                <View style={styles.verifyStep}>
                  <Text style={styles.stepTitle}>Step 2: Verify Setup</Text>
                  <Text style={styles.stepDescription}>
                    Enter the 6-digit code from your authenticator app:
                  </Text>

                  <TextInput
                    style={styles.codeInput}
                    value={verificationCode}
                    onChangeText={setVerificationCode}
                    placeholder="Enter 6-digit code"
                    keyboardType="numeric"
                    maxLength={6}
                    autoFocus
                  />

                  <View style={styles.buttonRow}>
                    <TouchableOpacity
                      style={styles.backButton}
                      onPress={() => setStep("setup")}
                    >
                      <Text style={styles.backButtonText}>Back</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.verifyButton,
                        loading && styles.disabledButton,
                      ]}
                      onPress={verify2FA}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="white" />
                      ) : (
                        <Text style={styles.verifyButtonText}>Enable 2FA</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <BackupCodesModal
        visible={showBackupCodes}
        codes={backupCodes}
        onClose={handleBackupCodesClose}
      />
    </>
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
    maxHeight: "80%",
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
  content: {
    flex: 1,
  },
  setupStep: {
    alignItems: "center",
  },
  verifyStep: {
    alignItems: "center",
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
  },
  stepDescription: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },
  qrContainer: {
    padding: 20,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    marginBottom: 20,
  },
  qrCode: {
    width: 200,
    height: 200,
  },
  loadingContainer: {
    alignItems: "center",
    padding: 40,
  },
  manualEntry: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    width: "100%",
  },
  manualTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    marginBottom: 5,
  },
  manualKey: {
    fontSize: 12,
    fontFamily: "monospace",
    color: "#007AFF",
    backgroundColor: "#e9ecef",
    padding: 8,
    borderRadius: 4,
  },
  codeInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 15,
    fontSize: 18,
    textAlign: "center",
    marginBottom: 20,
    width: "100%",
    letterSpacing: 4,
  },
  nextButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    width: "100%",
  },
  nextButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  backButton: {
    flex: 1,
    paddingVertical: 12,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
  },
  backButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  verifyButton: {
    flex: 1,
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    marginLeft: 10,
    borderRadius: 8,
  },
  verifyButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  disabledButton: {
    opacity: 0.6,
  },
  backupCodesContainer: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    width: "90%",
    maxHeight: "80%",
  },
  backupCodesTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    textAlign: "center",
    marginBottom: 10,
  },
  backupCodesSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginBottom: 20,
  },
  codesContainer: {
    maxHeight: 300,
    marginBottom: 20,
  },
  codeItem: {
    backgroundColor: "#f8f9fa",
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  codeText: {
    fontSize: 16,
    fontFamily: "monospace",
    textAlign: "center",
    color: "#333",
  },
  gotItButton: {
    backgroundColor: "#28a745",
    paddingVertical: 12,
    borderRadius: 8,
  },
  gotItButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
});

export default TwoFactorSetup;
