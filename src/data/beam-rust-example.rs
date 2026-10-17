use crate::runners::direct_runner::DirectRunner;
use crate::runners::runner::RunnerI;
use crate::transforms::impulse::Impulse;

#[tokio::test]
async fn run_direct_runner() {
    let runner = DirectRunner::new();

    runner.run(|root| root.apply(Impulse::new())).await;
}
