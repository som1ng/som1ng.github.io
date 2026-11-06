import nesting from 'tailwindcss/nesting/index.js';
import postcssImport from 'postcss-import';
import tailwindcss from 'tailwindcss';
export default {plugins:[postcssImport(),nesting(),tailwindcss()]};
