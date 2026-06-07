import React from 'react';

const IS_STEP0_MINIMAL = process.env.EXPO_PUBLIC_STEP0_MINIMAL === '1';

export default function Index() {
  if (IS_STEP0_MINIMAL) {
    const MinimalIndex = require('../src/step0/MinimalIndex').default;
    return <MinimalIndex />;
  }

  const FullIndex = require('../src/step0/FullIndex').default;
  return <FullIndex />;
}
