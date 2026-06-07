import { enableScreens } from 'react-native-screens';
enableScreens(false);

import React from 'react';

const IS_STEP0_MINIMAL = process.env.EXPO_PUBLIC_STEP0_MINIMAL === '1';

export { ErrorBoundary } from '../src/layouts/FullRootLayout';

export default function RootLayout() {
  if (IS_STEP0_MINIMAL) {
    const MinimalRootLayout = require('../src/step0/MinimalRootLayout').default;
    return <MinimalRootLayout />;
  }

  const FullRootLayout = require('../src/layouts/FullRootLayout').default;
  return <FullRootLayout />;
}
