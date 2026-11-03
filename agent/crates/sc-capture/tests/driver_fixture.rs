use sc_capture::{run_offline, Direction, LocalIpSet};
use std::collections::HashSet;
use std::path::PathBuf;

#[tokio::test]
async fn test_driver_offline_fixture() {
    let mut local_set = HashSet::new();
    local_set.insert(u32::from(std::net::Ipv4Addr::new(10, 0, 0, 2)) as u128);
    let local = LocalIpSet(local_set);

    let mut path = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    path.push("..");
    path.push("..");
    path.push("fixtures");
    path.push("loopback-trace.pcap");

    let mut channel = run_offline(&path, local).unwrap();
    let mut updates = Vec::new();
    while let Some(u) = channel.rx.recv().await {
        updates.push(u);
    }
    // 6 TCP frames
    assert_eq!(updates.len(), 6);
    let in_count = updates
        .iter()
        .filter(|u| u.direction == Direction::In)
        .count();
    let out_count = updates
        .iter()
        .filter(|u| u.direction == Direction::Out)
        .count();
    assert_eq!(in_count, 3);
    assert_eq!(out_count, 3);
}
