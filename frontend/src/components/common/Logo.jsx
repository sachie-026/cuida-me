import logo from "../../assets/logo.jpeg";

const Logo = ({ size = "md", className = "" }) => {
  const sizes = {
    sm: "h-7",
    md: "h-9",
    lg: "h-12",
    xl: "h-16",
  };
  return (
    <img
      src={logo}
      alt="Cuida.me"
      className={`${sizes[size]} w-auto object-contain ${className}`}
    />
  );
};

export default Logo;
