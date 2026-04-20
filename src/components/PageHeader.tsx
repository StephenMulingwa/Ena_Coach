interface PageHeaderProps {
  title: string;
  titleAccent?: string;
  subtitle?: string;
  right?: React.ReactNode;
}

export default function PageHeader({ title, titleAccent, subtitle, right }: PageHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: "28px",
      }}
    >
      <div>
        <h2
          style={{
            fontFamily: "var(--font-head)",
            fontSize: "1.65rem",
            fontWeight: 700,
            letterSpacing: "-.01em",
            color: "var(--text)",
          }}
        >
          {title}
          {titleAccent && <span style={{ color: "var(--accent)" }}> {titleAccent}</span>}
        </h2>
        {subtitle && (
          <p
            style={{
              fontSize: ".82rem",
              color: "var(--text2)",
              marginTop: "4px",
              fontWeight: 300,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}
