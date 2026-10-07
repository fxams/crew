/** Home never mounts the launch desk. Only `/launch` does. */
export function isLaunchPath(pathname: string): boolean {
  const path = (pathname || "/").replace(/\/+$/, "") || "/";
  return path === "/launch" || path.endsWith("/launch");
}
