const AsyncStorage = {
  getItem: async (_key: string) => null,
  setItem: async (_key: string, _value: string) => {},
  removeItem: async (_key: string) => {},
  multiGet: async (_keys: string[]) => [],
  multiSet: async (_entries: [string, string][]) => {},
  multiRemove: async (_keys: string[]) => {},
};

export default AsyncStorage;
