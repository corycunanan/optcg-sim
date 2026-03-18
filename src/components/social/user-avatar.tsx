interface User {
  username: string | null;
  name: string | null;
  image: string | null;
}

interface UserAvatarProps {
  user: User;
  size?: "sm" | "md";
  variant?: "light" | "dark";
}

export function UserAvatar({ user, size = "md", variant = "light" }: UserAvatarProps) {
  const sizeClass = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  const initials = (user.username || user.name || "?").charAt(0).toUpperCase();
  const fallbackClass =
    variant === "dark"
      ? "bg-navy-700 text-content-inverse"
      : "bg-navy-900 text-content-inverse";

  if (user.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.image}
        alt=""
        className={`${sizeClass} rounded-full object-cover`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} flex items-center justify-center rounded-full font-semibold ${fallbackClass}`}
    >
      {initials}
    </div>
  );
}
