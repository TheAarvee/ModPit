import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from "@/components/ui/avatar";

export interface ClusterCardProps {
  title: string;
  totalItems: number;
  criticalCount: number;
  highCount: number;
  lowCount: number;
  avatars: { src: string; alt?: string; fallback?: string }[];
  additionalAvatarsCount: number;
  onClick?: () => void;
}

export function ClusterCard({
  title,
  totalItems,
  criticalCount,
  highCount,
  lowCount,
  avatars,
  additionalAvatarsCount,
  onClick,
}: ClusterCardProps) {
  return (
    <div 
      onClick={onClick}
      className="bg-[#dbdbdb] rounded-[1.7rem] p-1.5 pt-4.5 flex flex-col h-[250px] cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg active:scale-[0.98]"
    >
      <div className="px-4.5 mb-3 text-[1.2rem] tracking-tight font-medium text-black">
        {title}
      </div>
      <div className="bg-white rounded-[1.35rem] p-5 pb-4.5 flex flex-col justify-between flex-1">
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-[3.1rem] leading-none font-medium tracking-tighter text-black">
            {totalItems}
          </span>
          <span className="text-[1.1rem] text-zinc-500 font-medium">items</span>
        </div>

        <div className="flex justify-between items-end">
          <ul className="space-y-1.5">
            <li className="flex items-center gap-2 text-[0.97rem]">
              <div className="w-[12px] h-[12px] rounded-full bg-black shrink-0" />
              <span className="text-black font-normal">Critical</span>
              <span className="text-zinc-500 ml-1">{criticalCount}</span>
            </li>
            <li className="flex items-center gap-2 text-[0.97rem]">
              <div className="w-[12px] h-[12px] rounded-full border-[2px] border-black flex items-center justify-center shrink-0">
                <div className="w-[4px] h-[4px] rounded-full bg-black" />
              </div>
              <span className="text-black font-normal">High</span>
              <span className="text-zinc-500 ml-1">{highCount}</span>
            </li>
            <li className="flex items-center gap-2 text-[0.97rem]">
              <div className="w-[12px] h-[12px] rounded-full border-[1.5px] border-black flex items-center justify-center shrink-0">
                <div className="w-[3.5px] h-[3.5px] rounded-full bg-black" />
              </div>
              <span className="text-black font-normal">Low</span>
              <span className="text-zinc-500 ml-1">{lowCount}</span>
            </li>
          </ul>

          <div className="flex items-center gap-3">
            <AvatarGroup>
              {avatars.map((avatar, idx) => (
                <Avatar key={idx} size="lg" className="ring-2 ring-white hover:z-10 transition-transform hover:scale-110">
                  <AvatarImage src={avatar.src} alt={avatar.alt || "Avatar"} />
                  <AvatarFallback>{avatar.fallback || "U"}</AvatarFallback>
                </Avatar>
              ))}
            </AvatarGroup>
            {additionalAvatarsCount > 0 && (
              <span className="text-[0.95rem] text-zinc-500 font-medium">
                +{additionalAvatarsCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
