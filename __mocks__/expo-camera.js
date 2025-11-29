export const Camera = {
  Constants: {
    Type: {
      back: 'back',
      front: 'front',
    },
    FlashMode: {
      on: 'on',
      off: 'off',
      auto: 'auto',
    },
  },
  requestCameraPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted' })
  ),
  getCameraPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted' })
  ),
};

export default Camera;

