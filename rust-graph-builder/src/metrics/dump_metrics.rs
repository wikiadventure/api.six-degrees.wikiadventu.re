use serde::Serialize;

pub fn format_duration(secs: f64) -> String {
    let total_secs = secs as u64;
    let hours = total_secs / 3600;
    let minutes = (total_secs % 3600) / 60;
    let seconds = total_secs % 60;
    
    if hours > 0 {
        format!("{}h {}m {}s", hours, minutes, seconds)
    } else if minutes > 0 {
        format!("{}m {}s", minutes, seconds)
    } else {
        format!("{:.2}s", secs)
    }
}

#[derive(Serialize)]
pub struct DumpMetrics {
    pub duration_sec: f64,
    pub duration_human: String,
    pub items_count: usize,
}

impl DumpMetrics {
    pub fn new(duration_sec: f64, items_count: usize) -> Self {
        Self {
            duration_sec,
            duration_human: format_duration(duration_sec),
            items_count,
        }
    }
}

#[derive(Serialize)]
pub struct BuildMetrics {
    pub language: String,
    pub total_time_sec: f64,
    pub total_time_human: String,
    pub pages: DumpMetrics,
    pub redirects: DumpMetrics,
    pub linktargets: DumpMetrics,
    pub pagelinks: DumpMetrics,
    pub csr_build_time_sec: f64,
    pub csr_build_time_human: String,
}

impl BuildMetrics {
    pub fn save(&self, lang: &str, date: &str) -> std::io::Result<()> {
        let metrics_path = format!("graphs/{}/{}/metrics.json", lang, date);
        let file_path = std::path::Path::new(&metrics_path);
        
        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        
        let metrics_json = serde_json::to_string_pretty(self)?;
        std::fs::write(&metrics_path, metrics_json)?;
        println!("Metrics saved to {}", metrics_path);
        
        Ok(())
    }
}
