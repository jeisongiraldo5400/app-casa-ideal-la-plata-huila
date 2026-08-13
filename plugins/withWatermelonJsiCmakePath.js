const { withDangerousMod } = require('@expo/config-plugins');
const { patchWatermelonJsiCmake } = require('../scripts/patch-watermelon-jsi-cmake');

module.exports = function withWatermelonJsiCmakePath(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      patchWatermelonJsiCmake(modConfig.modRequest.projectRoot);
      return modConfig;
    },
  ]);
};
