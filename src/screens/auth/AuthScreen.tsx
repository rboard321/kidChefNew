import React, { useState } from 'react';
import SignInScreen from './SignInScreen';
import SignUpScreen from './SignUpScreen';

export default function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  const switchToSignUp = () => setMode('signup');
  const switchToSignIn = () => setMode('signin');

  if (mode === 'signup') {
    return <SignUpScreen onSwitchToSignIn={switchToSignIn} />;
  }

  return <SignInScreen onSwitchToSignUp={switchToSignUp} />;
}