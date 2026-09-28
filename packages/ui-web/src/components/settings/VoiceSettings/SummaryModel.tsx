import { chatModelOption, useAppStore, useModels } from "@kotys/core";
import { ModelSelect } from "./ModelSelect";
import {
  SUBSECTION_CLASS,
  SUBSECTION_TEXT_CLASS,
  SUBSECTION_TITLE_CLASS,
} from "./styles";

export function SummaryModel() {
  const models = useModels();
  const summaryModel = useAppStore((s) => s.ttsSummaryModel);
  const setTtsSummaryModel = useAppStore((s) => s.setTtsSummaryModel);

  const handleChange = (key: string | null) => {
    const model = models.find((m) => chatModelOption(m).key === key);
    void setTtsSummaryModel(model ?? null);
  };

  return (
    <div className={SUBSECTION_CLASS}>
      <div>
        <h4 className={SUBSECTION_TITLE_CLASS}>Summaries for long replies</h4>
        <p className={SUBSECTION_TEXT_CLASS}>
          Long replies, and replies with tables or code, are read as a short
          summary written by this model when you press play. Pick a fast model;
          its reasoning is turned off. With None, every reply is read in full.
        </p>
      </div>
      <ModelSelect
        label="Summary model"
        models={models}
        loadError={null}
        selected={summaryModel ? chatModelOption(summaryModel) : null}
        emptyText="No chat models available yet."
        optionOf={chatModelOption}
        onChange={handleChange}
      />
    </div>
  );
}
