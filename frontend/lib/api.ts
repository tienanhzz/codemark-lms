function defaultApiUrl() {
  if (typeof window === "undefined") return "http://localhost:5000";
  const url = new URL(window.location.origin);
  url.port = "5000";
  return url.origin;
}

export const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL || defaultApiUrl()
).replace(/\/$/, "");

export const SOCKET_URL = (
  process.env.NEXT_PUBLIC_SOCKET_URL || API_BASE
).replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  rawBody?: BodyInit;
};

function notifyUnauthorized() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("lms:unauthorized"));
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, rawBody, headers, ...rest } = options;
  const init: RequestInit = {
    credentials: "include",
    ...rest,
    headers: { ...(headers || {}) },
  };
  if (rawBody !== undefined) {
    init.body = rawBody;
  } else if (body !== undefined) {
    init.headers = {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    };
    init.body = JSON.stringify(body);
  }
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch {
    throw new ApiError(
      "Cannot reach the API server. Make sure the Spring Boot backend is running and that the API URL matches the page host.",
      0,
      null,
    );
  }
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    if (response.status === 401) notifyUnauthorized();
    const message =
      typeof payload === "object" && payload && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status, payload);
  }
  if (typeof window !== "undefined" && ["POST", "PUT", "PATCH"].includes(rest.method || "")) window.dispatchEvent(new Event("lms:points"));
  return payload as T;
}

export async function download(path: string, filename: string) {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (!response.ok) {
    if (response.status === 401) notifyUnauthorized();
    throw new ApiError(`Download failed (${response.status})`, response.status, null);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function errorMessage(error: unknown) {
  const messages: Record<string,string> = {
    invalid_credentials:"Mã đăng nhập hoặc mật khẩu không đúng.", authentication_required:"Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.",
    forbidden:"Bạn không có quyền thực hiện thao tác này.", password_change_required:"Bạn phải đổi mật khẩu trước khi tiếp tục.",
    weak_password:"Mật khẩu cần ít nhất 12 ký tự và tối đa 72 byte UTF-8.", invalid_current_password:"Mật khẩu hiện tại không đúng.",
    password_must_differ:"Mật khẩu mới phải khác mật khẩu hiện tại.", invalid_student_id:"Mã đăng nhập phải có đúng 10 chữ số.",
    invalid_user:"Kiểm tra mã 10 số, họ tên và vai trò.",duplicate_student_id:"Mã đăng nhập đã tồn tại.",
    invalid_csv_header:"Tên cột CSV không đúng. Kiểm tra dòng tiêu đề và tên cột đã chọn.",invalid_csv:"File CSV không hợp lệ.",
    file_too_large:"File vượt quá 1 MiB.",too_many_rows:"File vượt quá 1000 dòng.",invalid_url:"Liên kết phải là URL http hoặc https hợp lệ.",
    invalid_score:"Điểm không hợp lệ hoặc vượt điểm tối đa.",invalid_tiers:"Tier phải bắt đầu từ 0, ngưỡng tăng dần, tên không trùng.",
    invalid_dates:"Ngày bắt đầu phải trước ngày kết thúc.",no_active_season:"Chưa có mùa hoạt động.",invalid_points:"Điểm hoặc lý do không hợp lệ.",
    deadline_exceeded:"Đã quá hạn nộp bài.",conflict:"Dữ liệu đã thay đổi hoặc đang được sử dụng. Vui lòng tải lại.",not_found:"Không tìm thấy dữ liệu.",
    network_denied:"Địa chỉ mạng này không được phép truy cập.",runner_unavailable:"Bộ chấm lập trình chưa hoạt động.",max_attempts_reached:"Bạn đã hết lượt làm bài.",
    student_not_enrolled:"Sinh viên chưa tham gia lớp này.",invalid_request:"Dữ liệu gửi lên không hợp lệ."
  };
  if (error instanceof ApiError) {
    if (messages[error.message]) return messages[error.message];
    if (error.status === 0) return "Không kết nối được máy chủ. Kiểm tra backend và địa chỉ API.";
    if (error.status >= 500) return `Máy chủ gặp lỗi (HTTP ${error.status}). Vui lòng kiểm tra log backend hoặc liên hệ quản trị viên.`;
    if (error.status === 404) return "Không tìm thấy chức năng trên máy chủ. Kiểm tra backend đã chạy bản mới nhất.";
    if (/^[a-z][a-z0-9_]{0,79}$/.test(error.message)) {
      return `Yêu cầu chưa được xử lý (HTTP ${error.status}, mã: ${error.message}). Vui lòng kiểm tra dữ liệu và thử lại.`;
    }
    return `Yêu cầu chưa được xử lý (HTTP ${error.status}). Vui lòng kiểm tra dữ liệu và thử lại.`;
  }
  return "Có lỗi xảy ra. Vui lòng thử lại.";
}
