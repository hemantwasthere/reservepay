import { Store } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
export function MerchantAvatar({
  url,
  name,
  className,
}: {
  url?: string | null;
  name?: string;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {url && (
        <AvatarImage
          src={url}
          alt={name ? `${name} merchant image` : "Merchant image"}
        />
      )}
      <AvatarFallback>
        {name?.trim() ? (
          name.trim().slice(0, 2).toUpperCase()
        ) : (
          <Store className="size-6" aria-hidden="true" />
        )}
      </AvatarFallback>
    </Avatar>
  );
}
