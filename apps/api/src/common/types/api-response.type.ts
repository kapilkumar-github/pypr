export type ApiResponse<T> = {
  success?: boolean;
  message?: string;
  data: T;
  redirect?: string | null;
};

export function createApiResponse<T>(
  data: T,
  message = 'Request successful',
  success = true,
  redirect: string | null = null,
): ApiResponse<T> {
  return {
    success,
    message,
    data,
    redirect,
  };
}
