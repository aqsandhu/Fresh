import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MaterialIcons } from '@expo/vector-icons';
import { ProfileStackParamList } from '@types';
import { COLORS, SPACING, BORDER_RADIUS, VALIDATION } from '@utils/constants';
import { Button, Input, LoadingOverlay } from '@components';
import { useAuthStore } from '@store';
import { authService } from '@services/auth.service';

export const EditProfileScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<ProfileStackParamList>>();
  const { user, updateUser } = useAuthStore();
  
  const [name, setName] = useState(user?.full_name || user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  const validate = (): boolean => {
    const newErrors: { name?: string; email?: string } = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    if (email && !VALIDATION.EMAIL_REGEX.test(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const response = await authService.updateProfile({
        full_name: name.trim(),
        email: email.trim() || undefined,
      });
      if (response.success && response.data) {
        updateUser({
          full_name: response.data.full_name || name.trim(),
          email: response.data.email || email.trim() || undefined,
        });
      } else {
        updateUser({ full_name: name.trim(), email: email.trim() || undefined });
      }
      navigation.goBack();
    } catch (error: any) {
      // Fallback: save locally if API fails
      updateUser({ full_name: name.trim(), email: email.trim() || undefined });
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LoadingOverlay visible={loading} message="Saving..." />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.gray700} />
        </TouchableOpacity>
        <Text style={styles.title}>Edit Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatar}>
            {user?.avatar ? (
              <Image source={{ uri: user.avatar }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>
                {name.charAt(0).toUpperCase()}
              </Text>
            )}
            <TouchableOpacity style={styles.cameraButton}>
              <MaterialIcons name="camera-alt" size={18} color={COLORS.white} />
            </TouchableOpacity>
          </View>
          <Text style={styles.changePhotoText}>Change Photo</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Input
            label="Full Name"
            placeholder="Enter your full name"
            value={name}
            onChangeText={(text) => {
              setName(text);
              setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            error={errors.name}
            leftIcon={<MaterialIcons name="person" size={20} color={COLORS.gray400} />}
          />

          <Input
            label="Email (Optional)"
            placeholder="your@email.com"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            leftIcon={<MaterialIcons name="email" size={20} color={COLORS.gray400} />}
          />

          <View style={styles.phoneContainer}>
            <Text style={styles.phoneLabel}>Phone Number</Text>
            <View style={styles.phoneValue}>
              <MaterialIcons name="phone" size={20} color={COLORS.gray400} />
              <Text style={styles.phoneText}>{user?.phone}</Text>
              <MaterialIcons name="lock" size={16} color={COLORS.gray400} />
            </View>
            <Text style={styles.phoneHint}>Phone number cannot be changed</Text>
          </View>
        </View>

        {/* Bottom padding */}
        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Save Button */}
      <View style={styles.footer}>
        <Button title="Save Changes" onPress={handleSave} size="large" />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.gray900,
  },
  avatarSection: {
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  cameraButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: COLORS.white,
  },
  changePhotoText: {
    fontSize: 14,
    color: COLORS.primary,
    marginTop: SPACING.sm,
  },
  form: {
    padding: SPACING.lg,
    marginTop: SPACING.lg,
  },
  phoneContainer: {
    marginBottom: SPACING.md,
  },
  phoneLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.gray700,
    marginBottom: SPACING.xs,
  },
  phoneValue: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  phoneText: {
    flex: 1,
    fontSize: 16,
    color: COLORS.gray600,
  },
  phoneHint: {
    fontSize: 12,
    color: COLORS.gray400,
    marginTop: SPACING.xs,
  },
  bottomPadding: {
    height: 100,
  },
  footer: {
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    backgroundColor: COLORS.white,
  },
});

export default EditProfileScreen;
