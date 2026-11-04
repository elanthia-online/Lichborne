// assets.d.ts — ambient declarations for the non-TypeScript files the renderer imports.
//
// Components import their stylesheets for the side effect (`import '../styles/x.css'`);
// Vite inlines them into the bundle. TypeScript 6+ reports a side-effect import it
// can't resolve, so this tells it a .css file is a module with nothing in it.
// A script file (no imports/exports): a wildcard module declaration must live in one.

declare module '*.css'
