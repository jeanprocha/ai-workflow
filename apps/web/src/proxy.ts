import { NextResponse, type NextRequest } from "next/server";

const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password"];
// "/chat", "/inbox" e "/approve" sao publicos mas NAO sao rotas de auth — um
// usuario logado acessando um link de chat/inbox/aprovacao nao deve ser
// chutado pro dashboard (o que aconteceria se entrassem em AUTH_ROUTES, ver
// o bloco isAuthRoute abaixo).
const PUBLIC_ROUTES = [...AUTH_ROUTES, "/chat", "/inbox", "/approve"];

export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("wf_session");
  const { pathname } = request.nextUrl;
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  if (!hasSession && !isPublicRoute) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSession && isAuthRoute) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
