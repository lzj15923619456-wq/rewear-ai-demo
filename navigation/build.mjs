import { build } from 'esbuild';
await build({entryPoints:['navigation.jsx'],bundle:true,outfile:'../dist/navigation.js',
  format:'iife',platform:'browser',target:['es2020'],jsx:'automatic',minify:true,
  define:{'process.env.NODE_ENV':'"production"'},legalComments:'linked'});
