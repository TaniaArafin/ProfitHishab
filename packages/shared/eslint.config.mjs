import { baseConfig } from '../../eslint.base.mjs';

export default baseConfig({ tsconfigRootDir: import.meta.dirname, project: ['./tsconfig.eslint.json'] });
