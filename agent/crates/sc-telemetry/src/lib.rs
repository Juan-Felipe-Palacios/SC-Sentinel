// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
pub fn name() -> &'static str {
    "sc-telemetry"
}

#[cfg(test)]
mod tests {
    #[test]
    fn smoke() {
        assert_eq!(super::name(), "sc-telemetry");
    }
}
