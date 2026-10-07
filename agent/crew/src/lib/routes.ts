function normalizePath(pathname: string): string {
  return (pathname || "/").replace(/\/+$/, "") || "/";
}

/** Home never mounts the launch desk. Only `/launch` does. */
export function isLaunchPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === "/launch" || path.endsWith("/launch");
}

/** Top-20 KOL directory page. */
export function isKolsPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  return path === "/kols" || path.endsWith("/kols");
}
