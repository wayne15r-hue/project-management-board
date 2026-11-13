import Image from "next/image";
import "./solar-eclipse.css";

export function SolarEclipse({ animation }: { animation?: React.ReactNode }) {
  return (
    <div className="solar-eclipse" aria-hidden="true">
      <div className="solar-eclipse-frame">
        <Image
          src="/landing/eclipse.webp"
          width={1024}
          height={576}
          className="solar-eclipse-image"
          alt=""
          unoptimized
          loading="eager"
          fetchPriority={animation ? "high" : undefined}
        />
        {animation}
        <div className="solar-eclipse-orbit" data-animated={animation ? true : undefined} />
      </div>
    </div>
  );
}
