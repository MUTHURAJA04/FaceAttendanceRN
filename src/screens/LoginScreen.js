import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { OAUTH_REDIRECT_URL } from '../services/clerkAuth';

export default function LoginScreen({ navigation }) {
  const { signInWithGoogle, handleOAuthCallback } = useAuth();
  const [loading, setLoading] = useState(false);

  const processCallbackUrl = useCallback(
    async url => {
      if (!url || !url.startsWith(OAUTH_REDIRECT_URL)) return;
      setLoading(true);
      try {
        const session = await handleOAuthCallback(url);
        if (session?.user) {
          navigation.replace('MainDrawer');
        }
      } catch (err) {
        Alert.alert('Google Sign-In Failed', err?.message || 'Could not complete sign-in.');
      } finally {
        setLoading(false);
      }
    },
    [handleOAuthCallback, navigation],
  );

  useEffect(() => {
    Linking.getInitialURL().then(url => {
      if (url) processCallbackUrl(url);
    });
    const sub = Linking.addEventListener('url', event => {
      processCallbackUrl(event?.url);
    });
    return () => sub.remove();
  }, [processCallbackUrl]);

  const onGooglePress = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setLoading(false);
      Alert.alert('Google Sign-In Error', err?.message || 'Unable to launch Google SSO.');
    }
  };

  return (
    <View className="flex-1 bg-[#111318] justify-center px-6">
      <View className="items-center mb-10">
        <View className="w-24 h-24 rounded-full bg-[#1A202C] border border-[#2D3748] items-center justify-center mb-5">
          <View className="w-12 h-12 rounded-xl border-2 border-[#0C83C6]" />
        </View>
        <Text className="text-white text-2xl font-bold">Attendo: Face</Text>
        <Text className="text-[#94A3B8] text-sm mt-1.5 text-center">
          Sign in with your organization Google account
        </Text>
      </View>

      <View className="bg-[#1A202C] rounded-2xl p-6 border border-[#2D3748]">
        <TouchableOpacity
          onPress={onGooglePress}
          disabled={loading}
          className={`flex-row items-center justify-center rounded-xl py-4 bg-white ${
            loading ? 'opacity-70' : ''
          }`}
        >
          {loading ? (
            <ActivityIndicator color="#111318" />
          ) : (
            <>
              <View className="w-6 h-6 rounded-full bg-[#4285F4] items-center justify-center mr-3">
                <Text className="text-white text-xs font-bold">G</Text>
              </View>
              <Text className="text-[#111318] text-base font-bold">Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
