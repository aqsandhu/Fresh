module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./src'],
          extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
          alias: {
            '@': './src',
            '@components': './src/components',
            '@screens': './src/screens',
            '@navigation': './src/navigation',
            '@services': './src/services',
            '@store': './src/store',
            '@hooks': './src/hooks',
            '@utils': './src/utils',
            '@app-types': './src/types',
            '@assets': './assets',
          },
        },
      ],
      'react-native-reanimated/plugin',
    ],
    env: {
      // Release builds ship without console noise (errors kept for crash
      // reporting breadcrumbs). Dev builds keep full logging.
      production: {
        plugins: [['transform-remove-console', { exclude: ['error'] }]],
      },
    },
  };
};
