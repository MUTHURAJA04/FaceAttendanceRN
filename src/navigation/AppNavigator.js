import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItemList,
} from '@react-navigation/drawer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { OtaUpdater } from '../native/FaceScanner';
import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import RecognizeScreen from '../screens/RecognizeScreen';
import EmployeeDirectoryScreen from '../screens/EmployeeDirectoryScreen';
import RegisterScreen from '../screens/RegisterScreen';
import OfflineQueueScreen from '../screens/OfflineQueueScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Stack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();

function CustomDrawerContent(props) {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const [appInfo, setAppInfo] = useState({
    packageName: 'com.faceattendancern',
    versionName: '1.0',
    versionCode: 1,
  });

  useEffect(() => {
    OtaUpdater.getAppInfo().then(info => {
      if (info) setAppInfo(info);
    });
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      props.navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#111318' }}>
      <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: insets.top + 12 }}>
        <View
          style={{
            paddingHorizontal: 18,
            paddingBottom: 16,
            borderBottomWidth: 1,
            borderBottomColor: '#1E293B',
            marginBottom: 8,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>
            {user?.fullName || 'Attendo: Face'}
          </Text>
          {!!user?.primaryEmailAddress?.emailAddress && (
            <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 2 }}>
              {user.primaryEmailAddress.emailAddress}
            </Text>
          )}
        </View>
        <DrawerItemList {...props} />
      </DrawerContentScrollView>

      <View
        style={{
          paddingHorizontal: 18,
          paddingTop: 12,
          paddingBottom: 16 + insets.bottom,
          borderTopWidth: 1,
          borderTopColor: '#1E293B',
        }}
      >
        <TouchableOpacity
          onPress={handleSignOut}
          style={{
            backgroundColor: 'rgba(239,68,68,0.15)',
            borderColor: 'rgba(239,68,68,0.4)',
            borderWidth: 1,
            borderRadius: 10,
            paddingVertical: 10,
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <Text style={{ color: '#F87171', fontSize: 13, fontWeight: '700' }}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={{ color: '#CBD5E1', fontSize: 12, fontWeight: '600' }}>
          Version {appInfo.versionName} (Build {appInfo.versionCode})
        </Text>
        <Text style={{ color: '#64748B', fontSize: 11, marginTop: 2 }}>
          {appInfo.packageName}
        </Text>
      </View>
    </View>
  );
}

function MainDrawer() {
  return (
    <Drawer.Navigator
      drawerContent={props => <CustomDrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerStyle: { backgroundColor: '#111318' },
        drawerActiveTintColor: '#0C83C6',
        drawerInactiveTintColor: '#94A3B8',
      }}
    >
      <Drawer.Screen
        name="Recognize"
        component={RecognizeScreen}
        options={{ title: 'Face Attendance', swipeEnabled: false }}
      />
      <Drawer.Screen
        name="EmployeeDirectory"
        component={EmployeeDirectoryScreen}
        options={{ title: 'Employee Directory' }}
      />
      <Drawer.Screen
        name="OfflineQueue"
        component={OfflineQueueScreen}
        options={{ title: 'Sync & Offline Queue' }}
      />
      <Drawer.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </Drawer.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="MainDrawer" component={MainDrawer} />
        <Stack.Screen name="Register" component={RegisterScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
