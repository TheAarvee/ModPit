import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export interface PostCardProps {
  postId: string;
  title: string;
  excerpt: string;
  authorAvatar: string;
  authorName: string;
  date: string;
  onClick?: (postId: string) => void;
}

export function PostCard({
  postId,
  title,
  excerpt,
  authorAvatar,
  authorName,
  date,
  onClick,
}: PostCardProps) {
  return (
    <button
      type="button"
      onClick={() => onClick?.(postId)}
      className="w-full text-left bg-white rounded-[1.45rem] p-5 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.1)] flex flex-col gap-6 transition-transform hover:-translate-y-1 hover:shadow-md cursor-pointer"
    >
      <div>
        <h3 className="text-[1.15rem] font-medium text-black leading-tight mb-1.5">
          {title}
        </h3>
        <p className="text-[0.84rem] text-[#999999] leading-snug">
          {excerpt}
        </p>
      </div>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Avatar className="size-6">
            <AvatarImage src={authorAvatar} alt={authorName} />
            <AvatarFallback className="text-[9px] bg-zinc-200 text-zinc-600">
              {authorName.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <span className="text-[0.78rem] font-medium text-black">{authorName}</span>
        </div>
        <span className="text-[0.74rem] text-[#999999] font-medium">{date}</span>
      </div>
    </button>
  );
}
