// Raw SQL migration files are bundled as strings by babel-plugin-inline-import.
declare module '*.sql' {
  const content: string;
  export default content;
}
