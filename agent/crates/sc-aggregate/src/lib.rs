// Copyright (c) 2026 Strategic Connex. Todos los derechos reservados.
pub fn name() -> &'static str {
    "sc-aggregate"
}

#[cfg(test)]
mod tests {
    #[test]
    fn smoke() {
        assert_eq!(super::name(), "sc-aggregate");
    }
}
